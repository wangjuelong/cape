"""Statistics-page service layer.

Wraps `lib.cuckoo.common.web_utils.statistics(s_days)` and shapes the
result for the v3 endpoint. Keeping the wrapper here lets us:
  - normalise OrderedDicts to plain dicts so DRF can serialise them
  - flatten the "tasks" per-day map into a sorted list
  - keep the upstream /statistics/<days>/ Django view untouched
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


def get_statistics(days: int) -> dict[str, Any]:
    """Return a JSON-friendly statistics blob for the given day window.

    Mirrors the dict upstream `/statistics/<days>/` passes to its
    template; the SPA reads the same fields via /api/v3/statistics/.
    """
    if days <= 0:
        days = 7

    try:
        from lib.cuckoo.common.web_utils import statistics as compute_statistics
    except ImportError:
        return _empty(days, error="statistics helper unavailable")

    try:
        details = compute_statistics(int(days))
    except Exception as exc:  # pragma: no cover — DB connectivity errors
        log.warning("statistics() raised: %s", exc)
        return _empty(days, error=str(exc))

    if not isinstance(details, dict):
        return _empty(days)

    total = int(details.get("total") or 0)
    average_str = str(details.get("average") or "0.00")
    try:
        average = float(average_str)
    except ValueError:
        average = 0.0

    tasks_per_day_raw = details.get("tasks") or {}
    tasks_per_day: list[dict[str, Any]] = [
        {
            "day": day,
            "added": int(stats.get("added", 0)),
            "reported": int(stats.get("reported", 0)),
            "failed": int(stats.get("failed", 0)),
        }
        for day, stats in tasks_per_day_raw.items()
    ]

    return {
        "days": days,
        "total": total,
        "average": average,
        "tasks_per_day": tasks_per_day,
        "processing": _module_table(details.get("processing")),
        "signatures": _module_table(details.get("signatures")),
        "reporting": _module_table(details.get("reporting")),
        "custom_statistics": _module_table(details.get("custom_statistics")),
        "top_samples": _top_samples(details.get("top_samples")),
        "detections": _detections(details.get("detections")),
        "asns": _asns(details.get("asns")),
        "distributed_tasks": _distributed(details.get("distributed_tasks")),
        "error": None,
    }


def _empty(days: int, error: str | None = None) -> dict[str, Any]:
    return {
        "days": days,
        "total": 0,
        "average": 0.0,
        "tasks_per_day": [],
        "processing": [],
        "signatures": [],
        "reporting": [],
        "custom_statistics": [],
        "top_samples": [],
        "detections": [],
        "asns": [],
        "distributed_tasks": [],
        "error": error,
    }


def _module_table(raw: Any) -> list[dict[str, Any]]:
    """Upstream stores `processing`/`signatures`/`reporting`/`custom_statistics`
    as a dict keyed by module name → entry dict. We flatten to a list and
    expose total/runs/avg the way upstream's table renders them."""
    if not isinstance(raw, dict):
        return []
    out: list[dict[str, Any]] = []
    for name, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        runs = _coerce_int(entry.get("runs"))
        total = _coerce_float(entry.get("time", entry.get("total")))
        avg = total / runs if runs else 0.0
        out.append(
            {
                "name": str(name),
                "total": round(total, 4),
                "runs": runs,
                "avg": round(avg, 4),
            }
        )
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


def _top_samples(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        return []
    out: list[dict[str, Any]] = []
    for day, samples in raw.items():
        if not isinstance(samples, dict):
            continue
        for sha256, count in samples.items():
            out.append({"day": str(day), "sha256": str(sha256), "count": _coerce_int(count)})
    out.sort(key=lambda x: x["count"], reverse=True)
    return out[:50]


def _detections(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        return []
    out = [
        {"family": str(family), "count": _coerce_int(count)}
        for family, count in raw.items()
    ]
    out.sort(key=lambda x: x["count"], reverse=True)
    return out


def _asns(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        return []
    out = [
        {"asn": str(asn), "count": _coerce_int(count)}
        for asn, count in raw.items()
    ]
    out.sort(key=lambda x: x["count"], reverse=True)
    return out


def _distributed(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        return []
    out: list[dict[str, Any]] = []
    for day, nodes in raw.items():
        if not isinstance(nodes, dict):
            continue
        for node, count in nodes.items():
            out.append({"day": str(day), "node": str(node), "count": _coerce_int(count)})
    return out


def _coerce_int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _coerce_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
