"""Task-centric service layer.

Maps PRD §5.2 ``TaskSummary`` to/from the SQLAlchemy ``Task`` model and
optional MongoDB enrichment (score / family / severity / verdict, only
populated for status == "reported"). Submission helpers wrap the existing
``download_file`` machinery so the v2 view's behaviour is preserved
exactly (PRD G1).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Iterable

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


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
    sort: str | None = None  # "added_on" / "-added_on" / "-id" / ...


@dataclass
class TaskListResult:
    items: list[dict[str, Any]] = field(default_factory=list)
    next_cursor: str | None = None
    total: int | None = None


def list_tasks(filters: TaskListFilters) -> TaskListResult:
    """Returns a TaskListResult with TaskSummary-shaped dicts.

    Cursor is the lower-bound ``id`` of the next page (descending order).
    The Postgres-known fields are always populated; ``score`` / ``family``
    / ``severity`` / ``verdict`` come from MongoDB only when the task is
    in ``reported`` status and Mongo is available.
    """
    from lib.cuckoo.core.database import Database

    db = Database()

    limit = max(1, min(filters.limit or 50, 200))
    id_before: int | None = int(filters.cursor) if filters.cursor else None

    statuses = list(filters.status) if filters.status else None
    rows = db.list_tasks(
        limit=limit + 1,
        category=filters.category,
        status="|".join(statuses) if statuses else None,
        added_before=filters.added_before,
        id_before=id_before,
        order_by="-id",
        include_hashes=True,
    )

    items_models = list(rows)
    has_more = len(items_models) > limit
    if has_more:
        items_models = items_models[:limit]

    summaries = [_task_to_summary(t) for t in items_models]

    reported_ids = [s["id"] for s in summaries if s["status"] == "reported"]
    if reported_ids:
        _enrich_from_mongo(summaries, reported_ids)

    next_cursor = str(items_models[-1].id) if has_more and items_models else None
    return TaskListResult(items=summaries, next_cursor=next_cursor)


def view_task(task_id: int) -> dict[str, Any] | None:
    from lib.cuckoo.core.database import Database

    db = Database()
    task = db.view_task(task_id, details=True)
    if not task:
        return None
    summary = _task_to_summary(task)
    if summary["status"] == "reported":
        _enrich_from_mongo([summary], [task_id])
    return summary


# ---------------------------------------------------------------------------
# Submission (thin wrapper around v2 helpers)
# ---------------------------------------------------------------------------


def submit_file_request(request: Any) -> dict[str, Any]:
    """Drives a multipart file submission.

    Mirrors the v2 ``tasks_create_file`` view but lifted out as a service
    so v3 can call the same code path. Caller (the view) provides the
    Django-style ``request`` containing both ``request.FILES`` and the
    18 shared params via POST body.
    """
    return _submit_request(request, mode="file")


def submit_url_request(request: Any) -> dict[str, Any]:
    """Drives a URL submission (request.data['url'])."""
    return _submit_request(request, mode="url")


def _submit_request(request: Any, *, mode: str) -> dict[str, Any]:
    from lib.cuckoo.common.web_utils import (
        download_file,
        get_user_filename,
        parse_request_arguments,
        process_new_task_files,
    )
    from lib.cuckoo.core.database import Database

    db = Database()

    (
        static,
        package,  # noqa: F841 — used implicitly via download_file
        timeout,  # noqa: F841
        priority,
        options,
        machine,
        platform,  # noqa: F841
        tags,  # noqa: F841
        custom,
        memory,  # noqa: F841
        clock,  # noqa: F841
        enforce_timeout,  # noqa: F841
        unique,
        referrer,  # noqa: F841
        tlp,  # noqa: F841
        tags_tasks,  # noqa: F841
        route,  # noqa: F841
        cape,  # noqa: F841
    ) = parse_request_arguments(request, keyword="data")

    # Validate machine
    vm_list = [vm.label for vm in db.list_machines()]
    task_machines: list[str] = []
    if machine and machine.lower() == "all":
        task_machines.extend(vm_list)
    elif machine and machine not in vm_list:
        return {
            "ok": False,
            "error_code": "machine_not_found",
            "error_value": f"Machine '{machine}' does not exist",
            "available": vm_list,
        }
    else:
        task_machines.append(machine or "")

    user_id = getattr(request.user, "id", None) or 0
    details: dict[str, Any] = {
        "errors": [],
        "request": request,
        "task_ids": [],
        "url": False,
        "params": {},
        "headers": {},
        "service": f"apiv3_{mode}_submit",
        "fhash": False,
        "options": options,
        "only_extraction": False,
        "user_id": user_id,
    }

    if mode == "url":
        url = request.data.get("url")
        if not url:
            return {"ok": False, "error_code": "url_required", "error_value": "url is required"}
        details["url"] = url
        status, payload = download_file(**details)
        if status == "error":
            return {"ok": False, "error_code": "submit_failed", "error_value": str(payload)}
        details["task_ids"] = payload.get("task_ids", [])
        if payload.get("errors"):
            details["errors"].extend(payload["errors"])
        return _submit_response(details, machines=task_machines)

    # mode == "file"
    files = request.FILES.getlist("file")
    if not files:
        return {"ok": False, "error_code": "no_file", "error_value": "No file was submitted"}

    opt_filename = get_user_filename(options, custom)
    list_of_tasks, details = process_new_task_files(request, files, details, opt_filename, unique)

    pcap_flag = bool(request.data.get("pcap", ""))

    for content, tmp_path, _ in list_of_tasks:
        if pcap_flag:
            task_id = db.add_pcap(file_path=tmp_path)
            details["task_ids"].append(task_id)
            continue
        if static:
            task_id = db.add_static(file_path=tmp_path, priority=priority, user_id=user_id)
            details["task_ids"].append(task_id)
            continue
        details["path"] = tmp_path
        details["content"] = content
        status, tasks_details = download_file(**details)
        if status == "error":
            details["errors"].append({os.path.basename(tmp_path).decode(): tasks_details})
        else:
            details["task_ids"] = tasks_details.get("task_ids", details["task_ids"])
            if tasks_details.get("errors"):
                details["errors"].extend(tasks_details["errors"])

    return _submit_response(details, machines=task_machines)


def _submit_response(details: dict[str, Any], *, machines: list[str]) -> dict[str, Any]:
    task_ids = details.get("task_ids") or []
    if not task_ids:
        return {
            "ok": False,
            "error_code": "submit_failed",
            "error_value": "Error adding task to database",
            "errors": details.get("errors", []),
        }
    msg = (
        f"Task ID {task_ids[0]} has been submitted"
        if len(task_ids) == 1
        else f"Task IDs {', '.join(str(x) for x in task_ids)} have been submitted"
    )
    return {
        "ok": True,
        "task_ids": list(task_ids),
        "message": msg,
        "machines": machines,
        "errors": details.get("errors", []),
    }


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _task_to_summary(task: Any) -> dict[str, Any]:
    sample = getattr(task, "sample", None)
    return {
        "id": task.id,
        "target": task.target,
        "sha256": getattr(sample, "sha256", None),
        "sha1": getattr(sample, "sha1", None),
        "md5": getattr(sample, "md5", None),
        "size": getattr(sample, "file_size", None),
        "type": getattr(sample, "file_type", None),
        "submitted": _iso(task.added_on),
        "started": _iso(task.started_on),
        "completed": _iso(task.completed_on),
        "duration": _duration_str(task.started_on, task.completed_on),
        "machine": task.machine,
        "package": task.package or "",
        "score": None,
        "severity": _severity_from_score(None),
        "verdict": "clean",
        "family": None,
        "signatures_count": task.signatures_total or 0,
        "yara_matches": 0,
        "network_count": task.domains or 0,
        "files_dropped": task.dropped_files or 0,
        "payloads": 0,
        "api_calls": task.api_calls or 0,
        "status": task.status,
        "tags": [t.name for t in (task.tags or [])],
    }


def _enrich_from_mongo(summaries: list[dict[str, Any]], task_ids: Iterable[int]) -> None:
    """Best-effort Mongo enrichment for ``score`` / ``family`` / ``severity``.

    Silently no-ops when MongoDB is not enabled (Elasticsearch-only or
    unit-test deployments).
    """
    try:
        from dev_utils.mongodb import mongo_find
    except ImportError:
        return
    try:
        cursor = mongo_find(
            "analysis",
            {"info.id": {"$in": list(task_ids)}},
            {"info.id": 1, "malscore": 1, "detections": 1, "_id": 0},
        )
        by_id = {doc.get("info", {}).get("id"): doc for doc in cursor}
    except Exception as e:  # pragma: no cover — Mongo connectivity errors
        log.debug("Mongo enrichment skipped: %s", e)
        return

    for s in summaries:
        doc = by_id.get(s["id"])
        if not doc:
            continue
        score = doc.get("malscore")
        if isinstance(score, (int, float)):
            s["score"] = float(score)
            s["severity"] = _severity_from_score(s["score"])
            s["verdict"] = _verdict_from_score(s["score"])
        detections = doc.get("detections")
        if isinstance(detections, dict):
            family = detections.get("family")
            if family:
                s["family"] = family


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _duration_str(start: Any, end: Any) -> str | None:
    if not start or not end:
        return None
    try:
        delta = end - start
    except TypeError:
        return None
    total = int(delta.total_seconds())
    if total < 60:
        return f"{total}s"
    minutes, seconds = divmod(total, 60)
    if minutes < 60:
        return f"{minutes}m {seconds:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def _severity_from_score(score: float | None) -> str:
    if score is None:
        return "clean"
    if score >= 8:
        return "crit"
    if score >= 6:
        return "high"
    if score >= 3:
        return "med"
    if score >= 1:
        return "low"
    return "clean"


def _verdict_from_score(score: float | None) -> str:
    if score is None:
        return "clean"
    if score >= 6:
        return "malicious"
    if score >= 3:
        return "suspicious"
    return "clean"
