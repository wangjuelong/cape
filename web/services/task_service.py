"""Task-centric service layer.

Skeleton — concrete methods land alongside their consuming v3 endpoints.
The shape returned by these helpers maps 1:1 to the TaskSummary contract
defined in PRD §5.2 / frontend/app/src/types/api.ts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TaskListFilters:
    status: tuple[str, ...] | None = None
    category: str | None = None
    package: str | None = None
    family: str | None = None
    severity: str | None = None
    added_after: str | None = None
    added_before: str | None = None
    cursor: str | None = None
    limit: int = 50
    sort: str | None = None


def list_tasks(_filters: TaskListFilters) -> dict[str, Any]:
    """Returns ``{data: TaskSummary[], meta: {next_cursor}}``.

    Implementation lands in PRD stage 2 W5 (Recent page).
    """
    raise NotImplementedError("list_tasks: implement in stage 2 W5")


def view_task(_task_id: int) -> dict[str, Any]:
    """Returns a single TaskSummary.

    Implementation lands in PRD stage 2 W4 (Submit success redirect).
    """
    raise NotImplementedError("view_task: implement in stage 2 W4")
