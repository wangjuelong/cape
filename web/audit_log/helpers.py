"""Single insert path for audit_events.

All callers — signals, view code, admin bridge — go through `log()`.
Two non-negotiable behaviours:

1.  Never raise. Audit write failures must not break the underlying
    business request. We log to the cape-web journal at ERROR and
    return None.
2.  Redact metadata keys whose names look sensitive. Stops accidental
    capture of credentials passed in via request bodies.
"""

from __future__ import annotations

import json
import logging
from typing import Any

log = logging.getLogger(__name__)


_SENSITIVE_KEYWORDS = ("password", "token", "secret", "cookie", "authorization")
_REDACTED = "[REDACTED]"


def _is_sensitive(key: str) -> bool:
    """Case-insensitive substring match against the keyword list."""
    k = key.lower()
    return any(word in k for word in _SENSITIVE_KEYWORDS)


def _coerce_value(value: Any) -> Any:
    """Round-trip through json.dumps with default=str so unjsonable
    objects (datetime, Decimal, Path) become strings instead of
    raising in the DB-side JSONField serialiser."""
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        k: _REDACTED if _is_sensitive(k) else _coerce_value(v)
        for k, v in raw.items()
    }


def log(
    action: str,
    *,
    request=None,
    actor=None,
    target_type: str | None = None,
    target_id: str | int | None = None,
    target_label: str | None = None,
    success: bool = True,
    **metadata: Any,
) -> None:
    """Write one row to audit_events. See module docstring for contract.

    Resolution order for actor / IP / UA:
      1. Explicit `actor=` kwarg wins over `request.user`.
      2. IP / UA are always pulled from `request.META` if `request` was
         supplied — even when `actor=` was overridden (we still want the
         caller's network identity for forensic purposes).
      3. Anything not derivable stays NULL.
    """
    try:
        # Lazy import — avoids "Apps not ready yet" at import time.
        from audit_log.models import AuditEvent

        # Resolve actor identity
        actor_user_id: int | None = None
        actor_username: str | None = None
        if actor is not None:
            actor_user_id = getattr(actor, "id", None)
            actor_username = getattr(actor, "username", None)
        elif request is not None:
            req_user = getattr(request, "user", None)
            if req_user is not None and getattr(req_user, "is_authenticated", False):
                actor_user_id = getattr(req_user, "id", None)
                actor_username = getattr(req_user, "username", None)

        # Resolve network identity (request only — actor doesn't carry IP)
        actor_ip: str | None = None
        actor_user_agent: str | None = None
        if request is not None:
            meta = getattr(request, "META", {}) or {}
            actor_ip = meta.get("REMOTE_ADDR") or None
            ua = meta.get("HTTP_USER_AGENT") or None
            # Trim absurdly long UAs (rare malicious clients send 100k+).
            actor_user_agent = ua[:1024] if ua else None

        AuditEvent.objects.create(
            action=action,
            actor_user_id=actor_user_id,
            actor_username=actor_username,
            actor_ip=actor_ip,
            actor_user_agent=actor_user_agent,
            success=success,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            target_label=target_label,
            metadata=_build_metadata(metadata),
        )
    except Exception:
        log.exception("audit log write failed (action=%s)", action)
