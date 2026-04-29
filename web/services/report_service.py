"""Report retrieval service — single point of contact with MongoDB / ES.

This module centralises every Mongo field path used by v3 endpoints, so
that schema renames or store migrations only require touching one file
(PRD §9 R7). v3 report views MUST go through helpers here; they MUST NOT
call ``mongo_find_*`` directly.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


# Centralised projection definitions. Each entry is a Mongo projection
# returning the smallest set of fields a v3 endpoint needs.
_PROJECTIONS: dict[str, dict[str, int]] = {
    "summary": {
        "info": 1,
        "target.file.name": 1,
        "target.file.type": 1,
        "target.url": 1,
        "malscore": 1,
        "detections": 1,
        "signatures.name": 1,
        "signatures.description": 1,
        "signatures.severity": 1,
        "signatures.ttp": 1,
        "network.hosts": 1,
        "network.domains": 1,
        "network.tcp": 1,
        "network.udp": 1,
        "network.http": 1,
        "network.http_ex": 1,
        "network.https_ex": 1,
        "behavior.summary": 1,
        "behavior.processes": 1,
        "dropped": 1,
        "shots": 1,
        "CAPE.payloads": 1,
        "procmemory": 1,
        "procdump": 1,
        "ttps": 1,
        "mitre_attck": 1,
        "malware_conf": 1,
        "static": 1,
        "_id": 0,
    },
    "static": {
        "static": 1,
        "target.file": 1,
        "_id": 0,
    },
    "behavior": {
        "behavior.processes": 1,
        "behavior.processtree": 1,
        "detections2pid": 1,
        "info.tlp": 1,
        "_id": 0,
    },
    "network": {
        "network": 1,
        "suricata": 1,
        "_id": 0,
    },
    "attack": {
        "ttps": 1,
        "mitre_attck": 1,
        "_id": 0,
    },
    "signatures": {
        "signatures": 1,
        "_id": 0,
    },
    "config": {
        "malware_conf": 1,
        "_id": 0,
    },
}


# Section name → presence detector. Returns truthy if the SPA should
# render the corresponding tab. Detectors only run against the small
# `summary` projection so we get the full nine-tab visibility picture
# in one Mongo round-trip.
_SECTION_DETECTORS = {
    "summary": lambda d: True,  # always shown
    "static": lambda d: bool(d.get("static") or _path(d, "target.file.pe")),
    "behavior": lambda d: bool(_path(d, "behavior.summary") or _path(d, "behavior.processes")),
    "network": lambda d: bool(_path(d, "network.hosts") or _path(d, "network.domains")),
    "dropped": lambda d: bool(d.get("dropped")),
    "screenshots": lambda d: bool(d.get("shots")),
    "payloads": lambda d: bool(_path(d, "CAPE.payloads")),
    "attack": lambda d: bool(d.get("ttps") or d.get("mitre_attck")),
    "config": lambda d: bool(d.get("malware_conf")),
}


def fetch_report_section(task_id: int, section: str) -> dict[str, Any] | None:
    """Returns a Mongo doc filtered by the projection registered for
    ``section``. Returns None if no such doc / Mongo unavailable."""
    projection = _PROJECTIONS.get(section)
    if projection is None:
        raise ValueError(f"Unknown report section: {section}")
    return _mongo_find_one(task_id, projection)


def fetch_summary(task_id: int) -> dict[str, Any] | None:
    """Returns a structured summary for /api/v3/reports/<id>/summary/.

    Shape (frontend types/api.ts -> ReportSummary):

      {
        "available_sections": [...],
        "tab_counts": {...},
        "signatures": [{name, description, severity, ttp[]}],
        "score": float | null,
        "severity": <SEV>,
        "verdict": <VERDICT>,
        "family": str | null
      }

    The ``task`` field is added by the view (it already has a
    TaskSummary in hand from the task service).
    """
    doc = _mongo_find_one(task_id, _PROJECTIONS["summary"])
    if doc is None:
        return None

    available_sections = [name for name, detector in _SECTION_DETECTORS.items() if detector(doc)]

    signatures_raw = doc.get("signatures") or []
    signatures = [
        {
            "name": s.get("name") or "",
            "description": s.get("description") or "",
            "severity": _coerce_severity(s.get("severity")),
            "ttp": list(s.get("ttp") or []),
        }
        for s in signatures_raw
    ]

    behavior_summary = _path(doc, "behavior.summary") or {}
    network = doc.get("network") or {}
    http_count = (
        len(network.get("http_ex") or []) + len(network.get("https_ex") or [])
        if (network.get("http_ex") or network.get("https_ex"))
        else len(network.get("http") or [])
    )
    api_calls_total = sum(int(p.get("calls_count") or 0) for p in (_path(doc, "behavior.processes") or []))

    tab_counts: dict[str, int | str] = {
        "summary": len(signatures_raw),
        "static": _len_safe(doc.get("static")),
        "behavior": _humanize_count(api_calls_total) if api_calls_total else 0,
        "network": (
            len(network.get("hosts") or [])
            + len(network.get("domains") or [])
            + len(network.get("tcp") or [])
            + len(network.get("udp") or [])
            + http_count
        ),
        "dropped": len(doc.get("dropped") or []),
        "screenshots": len(doc.get("shots") or []),
        "payloads": len(_path(doc, "CAPE.payloads") or []),
        "attack": len(doc.get("ttps") or []) or len(doc.get("mitre_attck") or []),
        "config": len(doc.get("malware_conf") or []),
    }

    score = doc.get("malscore")
    score_val = float(score) if isinstance(score, (int, float)) else None
    detections = doc.get("detections") or {}
    family = detections.get("family") if isinstance(detections, dict) else None

    return {
        "available_sections": available_sections,
        "tab_counts": tab_counts,
        "signatures": signatures,
        "score": score_val,
        "severity": _severity_from_score(score_val),
        "verdict": _verdict_from_score(score_val),
        "family": family,
        "behavior_summary": _trim_behavior_summary(behavior_summary),
    }


def list_sections(task_id: int) -> list[str]:
    """Returns the subset of report section names that have non-empty
    data for the given task."""
    doc = _mongo_find_one(task_id, _PROJECTIONS["summary"])
    if doc is None:
        return ["summary"]
    return [name for name, detector in _SECTION_DETECTORS.items() if detector(doc)]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _mongo_find_one(task_id: int, projection: dict[str, int]) -> dict[str, Any] | None:
    try:
        from dev_utils.mongodb import mongo_find_one
    except ImportError:
        return None
    try:
        return mongo_find_one("analysis", {"info.id": int(task_id)}, projection)
    except Exception as exc:  # pragma: no cover — Mongo connectivity issues
        log.warning("Mongo lookup failed for task %s: %s", task_id, exc)
        return None


def _path(d: dict[str, Any], dotted: str) -> Any:
    """Walks a dotted Mongo field path. Returns None if any segment is
    missing or the parent is not a dict."""
    current: Any = d
    for part in dotted.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


def _len_safe(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (list, tuple, dict, str, bytes)):
        return len(value)
    return 1


def _humanize_count(n: int) -> str | int:
    if n < 1000:
        return n
    return f"{n / 1000:.1f}k"


def _coerce_severity(raw: Any) -> int:
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return 1
    return max(1, min(5, v))


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


def _trim_behavior_summary(summary: dict[str, Any]) -> dict[str, list[str]]:
    """Reduce behavior.summary to a small set the SPA actually renders.

    The full structure can be megabytes; for the Summary tab we only need
    counts/preview lists for files / registry / mutexes / commands / APIs.
    """
    result: dict[str, list[str]] = {}
    for key in ("files", "read_files", "write_files", "delete_files", "registry_keys", "mutexes", "executed_commands", "resolved_apis"):
        items = summary.get(key)
        if isinstance(items, list):
            result[key] = [str(x) for x in items[:50]]
    return result
