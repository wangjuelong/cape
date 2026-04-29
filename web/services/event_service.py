"""Task event polling for the SSE endpoint.

Aim: detect "something happened to a task" so the SPA can invalidate its
TanStack Query caches and refetch. Precision matters less than coverage —
duplicate emissions are harmless on the client side.

Strategy (PRD R11): plain polling, no Postgres LISTEN/NOTIFY in MVP.

Each poll cycle the service compares an internal {task_id: status} snapshot
against a fresh snapshot of tasks in active or recently-terminal states.
Diffs are emitted as PRD §5.5 events.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable


# Tasks in these statuses are "live" and worth tracking. We also peek at
# recently-terminal statuses so transitions out are still observed.
_ACTIVE_STATUSES = {"pending", "running", "completed"}
_RECENT_TERMINAL_WINDOW = timedelta(minutes=10)


@dataclass(frozen=True)
class TaskEvent:
    type: str  # "task.added" | "task.status" | "task.deleted"
    task_id: int
    status: str | None
    ts: str


def snapshot_active_tasks() -> dict[int, str]:
    """Returns {task_id: status} for everything currently worth tracking."""
    from lib.cuckoo.core.data.task import Task
    from lib.cuckoo.core.database import Database

    db = Database()
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - _RECENT_TERMINAL_WINDOW
    order = Task.id.desc()

    snapshot: dict[int, str] = {}

    for status in _ACTIVE_STATUSES:
        for task in db.list_tasks(status=status, limit=500, order_by=order):
            snapshot[task.id] = task.status

    # Tasks that transitioned to a terminal state recently.
    for task in db.list_tasks(completed_after=cutoff, limit=500, order_by=order):
        snapshot[task.id] = task.status

    return snapshot


def diff_snapshots(prev: dict[int, str], curr: dict[int, str]) -> Iterable[TaskEvent]:
    ts = datetime.now(timezone.utc).isoformat()
    for task_id, status in curr.items():
        if task_id not in prev:
            yield TaskEvent(type="task.added", task_id=task_id, status=status, ts=ts)
        elif prev[task_id] != status:
            yield TaskEvent(type="task.status", task_id=task_id, status=status, ts=ts)
    for task_id, prev_status in prev.items():
        if task_id not in curr:
            # Drop-out usually means the task aged out of our tracking
            # window. Emit a final task.status so the SPA refreshes its
            # cached row with the now-terminal value.
            yield TaskEvent(type="task.status", task_id=task_id, status=prev_status, ts=ts)
