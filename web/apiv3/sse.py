"""SSE event stream for task / machine status changes.

Mounted at ``GET /api/v3/events/tasks`` (PRD §6.5 + D-12.1).

Implementation notes:

- **Plain Django async view, not DRF**. DRF's ``@api_view`` rejects
  coroutine return values in ``finalize_response``, so we bypass DRF
  for this single long-lived endpoint. Auth is enforced manually via
  ``request.user.is_authenticated`` (Django session middleware sets it).
- Requires ASGI; in production this endpoint must route to daphne, not
  uwsgi. The dev ``runserver`` uses ASGI when ``ASGI_APPLICATION`` is
  set, which is already the case (``web.web.settings.ASGI_APPLICATION``).
- **Session-only auth**. ``EventSource`` cannot send custom headers, so
  the bearer-token clients keep their existing v2 polling. Per D-12.1.
- **Polling, not LISTEN/NOTIFY**. Per PRD R11 we start with a 2-second
  polling fallback; can be upgraded to Postgres LISTEN/NOTIFY later
  without changing the SSE wire format.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator

from asgiref.sync import sync_to_async
from django.http import HttpRequest, HttpResponse, StreamingHttpResponse

from services import event_service

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 2.0
HEARTBEAT_EVERY = 15  # heartbeat each N polls (≈ 30s)


def _format_event(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def _stream(initial_snapshot: dict[int, str]) -> AsyncIterator[str]:
    """Coroutine that yields formatted SSE chunks."""
    snapshot = initial_snapshot
    cycles = 0
    while True:
        try:
            new_snapshot = await sync_to_async(event_service.snapshot_active_tasks)()
        except Exception as exc:  # pragma: no cover — DB connectivity issues
            log.warning("SSE poll failed: %s", exc)
            yield _format_event("error", {"message": str(exc)})
            await asyncio.sleep(POLL_INTERVAL_SECONDS * 2)
            continue

        for ev in event_service.diff_snapshots(snapshot, new_snapshot):
            yield _format_event(ev.type, dataclasses.asdict(ev))

        snapshot = new_snapshot
        cycles += 1
        if cycles % HEARTBEAT_EVERY == 0:
            yield _format_event("heartbeat", {"ts": datetime.now(timezone.utc).isoformat()})

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def task_events(request: HttpRequest) -> HttpResponse:
    """Plain Django async view (no DRF wrapper).

    Auth: relies on session middleware to populate ``request.user``.
    Token-bearing clients should keep using v2 polling — see D-12.1.
    """
    user = await request.auser() if hasattr(request, "auser") else request.user
    if not user.is_authenticated:
        return HttpResponse(status=401)

    initial = await sync_to_async(event_service.snapshot_active_tasks)()
    response = StreamingHttpResponse(
        _stream(initial),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # disables proxy buffering for nginx
    return response
