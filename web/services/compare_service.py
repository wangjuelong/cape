"""Compare-page service layer.

Wraps upstream `web/compare/views.py` so v3 can serve the same data the
legacy `/compare/<left>/[<right>/]` views serve, but as JSON.

Two modes:

  candidates(left_id)       — return the left task's metadata + every
                              other Mongo analysis with the same target
                              file md5.
  diff(left_id, right_id)   — return both tasks' metadata, a per-task
                              behavior-category percentage breakdown, and
                              the overlapping behavior-summary keys.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


def candidates(left_id: int) -> dict[str, Any]:
    """Mirror upstream `compare/views.py:left()` — fetch the left task's
    target/info plus every other analysis with the same `target.file.md5`.
    """
    from . import task_service

    left_summary = task_service.view_task(left_id)
    if not left_summary:
        return {
            "ok": False,
            "error_code": "left_not_found",
            "error_value": f"Task {left_id} not found",
            "left": None,
            "records": [],
        }

    left_md5 = left_summary.get("md5")
    if not left_md5:
        return {
            "ok": False,
            "error_code": "left_md5_missing",
            "error_value": f"Task {left_id} has no md5 — it cannot be compared.",
            "left": left_summary,
            "records": [],
        }

    records: list[dict[str, Any]] = []

    try:
        from dev_utils.mongodb import mongo_find
    except ImportError:
        # Mongo not available — best-effort return: no candidates.
        return {
            "ok": True,
            "left": left_summary,
            "records": records,
            "md5": left_md5,
        }

    try:
        cursor = mongo_find(
            "analysis",
            {
                "$and": [
                    {"target.file.md5": left_md5},
                    {"info.id": {"$ne": int(left_id)}},
                ]
            },
            {"info.id": 1, "_id": 0},
        )
        seen_ids: set[int] = set()
        for doc in cursor:
            tid = doc.get("info", {}).get("id") if isinstance(doc, dict) else None
            if tid is None:
                continue
            try:
                tid_int = int(tid)
            except (TypeError, ValueError):
                continue
            if tid_int in seen_ids or tid_int == left_id:
                continue
            seen_ids.add(tid_int)
            summary = task_service.view_task(tid_int)
            if summary:
                records.append(summary)
    except Exception as exc:  # pragma: no cover — Mongo connectivity
        log.warning("compare candidates lookup failed: %s", exc)

    return {
        "ok": True,
        "left": left_summary,
        "records": records,
        "md5": left_md5,
    }


def diff(left_id: int, right_id: int) -> dict[str, Any]:
    """Mirror upstream `compare/views.py:both()` — counts dict + summary."""
    from . import task_service

    left_summary = task_service.view_task(left_id)
    right_summary = task_service.view_task(right_id)
    if not left_summary:
        return {
            "ok": False,
            "error_code": "left_not_found",
            "error_value": f"Left task {left_id} not found",
        }
    if not right_summary:
        return {
            "ok": False,
            "error_code": "right_not_found",
            "error_value": f"Right task {right_id} not found",
        }

    counts: dict[str, dict[str, float]] = {}
    summary: dict[str, list[str]] = {}

    try:
        from lib.cuckoo.common.compare import (
            helper_percentages_mongo,
            helper_summary_mongo,
        )

        try:
            raw_counts = helper_percentages_mongo(int(left_id), int(right_id)) or {}
            # Helper keys by tid (int); convert to string-keyed for JSON.
            counts = {str(tid): row for tid, row in raw_counts.items()}
        except Exception as exc:  # pragma: no cover
            log.warning("helper_percentages_mongo failed: %s", exc)
        try:
            raw_summary = helper_summary_mongo(int(left_id), int(right_id)) or {}
            summary = {str(k): list(v) for k, v in raw_summary.items() if isinstance(v, (list, tuple))}
        except Exception as exc:  # pragma: no cover
            log.warning("helper_summary_mongo failed: %s", exc)
    except ImportError:
        # Compare helpers / Mongo not available — return empties.
        log.debug("compare helpers unavailable; returning empty diff")

    return {
        "ok": True,
        "left": left_summary,
        "right": right_summary,
        "left_counts": counts.get(str(left_id), {}),
        "right_counts": counts.get(str(right_id), {}),
        "summary": summary,
    }
