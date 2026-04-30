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
# Static tab
# ---------------------------------------------------------------------------


def fetch_static(task_id: int) -> dict[str, Any] | None:
    """Returns the Static tab payload — PE info, certificates, imports,
    sections, plus high-level fields like CAPA / curtain.

    Shape: passthrough of the relevant Mongo projection. The SPA renders
    it as a JSON tree without imposing schema (the parsers vary too much
    by file type).
    """
    doc = _mongo_find_one(task_id, _PROJECTIONS["static"])
    if doc is None:
        return None
    return {
        "static": doc.get("static") or {},
        "target_file": _path(doc, "target.file") or {},
    }


# ---------------------------------------------------------------------------
# ATT&CK tab
# ---------------------------------------------------------------------------


def fetch_attack(task_id: int) -> dict[str, Any] | None:
    """Returns the structured TTP / ATT&CK output.

    Per OQ2 in report-page-spec, we pass through what mapTTPs.py /
    reporting writes into Mongo without re-modelling.
    """
    doc = _mongo_find_one(task_id, _PROJECTIONS["attack"])
    if doc is None:
        return None
    return {
        "ttps": doc.get("ttps") or [],
        "mitre_attck": doc.get("mitre_attck") or [],
    }


# ---------------------------------------------------------------------------
# Config tab
# ---------------------------------------------------------------------------


def fetch_config(task_id: int) -> dict[str, Any] | None:
    """Returns the CAPE-extracted malware configuration as-is."""
    doc = _mongo_find_one(task_id, _PROJECTIONS["config"])
    if doc is None:
        return None
    return {"malware_conf": doc.get("malware_conf") or []}


# ---------------------------------------------------------------------------
# Network / Dropped / Screenshots / Payloads tabs
# ---------------------------------------------------------------------------


def fetch_network(task_id: int) -> dict[str, Any] | None:
    """Returns the Network tab payload.

    PRD R-D29 calls for per-protocol sub-endpoints (cf. report-page-spec
    §9). For now we ship the lightweight summary doc — every tab below
    Network is a small array — so a single Mongo round-trip is fine.
    Heavy protocols (HTTP flows, Suricata alerts) get their own endpoint
    later if/when latency becomes a problem.
    """
    doc = _mongo_find_one(task_id, _PROJECTIONS["network"])
    if doc is None:
        return None
    network = doc.get("network") or {}
    suricata = doc.get("suricata") or {}

    def _first(*keys: str) -> list[Any]:
        for k in keys:
            v = network.get(k)
            if v:
                return v
        return []

    http_flows = _first("http_ex", "https_ex", "http")

    return {
        "hosts": network.get("hosts") or [],
        "domains": network.get("domains") or [],
        "tcp": network.get("tcp") or [],
        "udp": network.get("udp") or [],
        "icmp": network.get("icmp") or [],
        "smtp": network.get("smtp") or [],
        "irc": network.get("irc") or [],
        "http": http_flows,
        "suricata": {
            "alerts": suricata.get("alerts") or [],
            "tls": suricata.get("tls") or [],
            "http": suricata.get("http") or [],
            "files": suricata.get("files") or [],
        },
    }


def fetch_dropped(task_id: int) -> dict[str, Any] | None:
    """Returns the dropped-files metadata."""
    doc = _mongo_find_one(
        task_id,
        {"dropped": 1, "_id": 0},
    )
    if doc is None:
        return None
    return {"dropped": doc.get("dropped") or []}


def fetch_payloads(task_id: int) -> dict[str, Any] | None:
    """Returns the CAPE-unpacked payload metadata."""
    doc = _mongo_find_one(
        task_id,
        {"CAPE.payloads": 1, "_id": 0},
    )
    if doc is None:
        return None
    cape = doc.get("CAPE") or {}
    return {"payloads": cape.get("payloads") or []}


def fetch_screenshots(task_id: int) -> dict[str, Any] | None:
    """Returns the screenshot index. The actual PNG bytes still come
    from the legacy v2 endpoint (``/apiv2/tasks/get/screenshot/<id>/<n>/``)
    so the SPA can use a plain ``<img>`` tag with cookie auth.
    """
    doc = _mongo_find_one(
        task_id,
        {"shots": 1, "_id": 0},
    )
    if doc is None:
        return None
    shots = doc.get("shots") or []
    return {
        "count": len(shots),
        "shots": [
            {
                "index": i,
                "url": f"/apiv2/tasks/get/screenshot/{task_id}/{i}/",
                "thumbnail_url": f"/apiv2/tasks/get/screenshot/{task_id}/{i}/",
            }
            for i in range(len(shots))
        ],
    }


# ---------------------------------------------------------------------------
# Behavior tab
# ---------------------------------------------------------------------------


def fetch_behavior(task_id: int) -> dict[str, Any] | None:
    """Returns process tree + per-process summary for the Behavior tab.

    Shape:
        {
          "platform": "windows" | "linux" | None,
          "processtree": <recursive dict>,
          "processes": [
            {"pid": int, "ppid": int|None, "name": str,
             "calls_count": int, "chunk_count": int}
          ]
        }
    """
    doc = _mongo_find_one(
        task_id,
        {
            "info.machine.platform": 1,
            "behavior.processtree": 1,
            "behavior.processes.process_id": 1,
            "behavior.processes.parent_id": 1,
            "behavior.processes.process_name": 1,
            "behavior.processes.calls": 1,
            "_id": 0,
        },
    )
    if doc is None:
        return None

    behavior = doc.get("behavior") or {}
    raw_processes = behavior.get("processes") or []
    processes = []
    for p in raw_processes:
        chunks = p.get("calls") or []
        processes.append(
            {
                "pid": p.get("process_id"),
                "ppid": p.get("parent_id"),
                "name": p.get("process_name") or "",
                # Each chunk holds ~100 calls (CHUNK_CALL_SIZE in
                # modules/reporting/report_doc.py); accurate count
                # requires fetching every chunk so we approximate.
                "calls_count": len(chunks) * 100,
                "chunk_count": len(chunks),
            }
        )

    return {
        "platform": _path(doc, "info.machine.platform"),
        "processtree": behavior.get("processtree") or [],
        "processes": processes,
    }


def fetch_behavior_calls(
    task_id: int,
    pid: int,
    page: int = 0,
) -> dict[str, Any] | None:
    """Returns one chunk (~100 calls) for the given process.

    ``page`` is the 0-based chunk index — i.e. ``behavior.processes[…].calls[page]``
    is dereferenced as an ObjectId in the ``calls`` collection.
    """
    doc = _mongo_find_one(
        task_id,
        {
            "behavior.processes.process_id": 1,
            "behavior.processes.calls": 1,
            "_id": 0,
        },
    )
    if doc is None:
        return None

    target = None
    for p in (_path(doc, "behavior.processes") or []):
        if p.get("process_id") == pid:
            target = p
            break
    if target is None:
        return None

    chunk_ids = target.get("calls") or []
    total_chunks = len(chunk_ids)
    if page < 0 or page >= total_chunks:
        return {"calls": [], "page": page, "total_chunks": total_chunks, "has_next": False}

    chunk_doc = _fetch_calls_chunk(chunk_ids[page])
    calls = (chunk_doc or {}).get("calls", [])

    return {
        "calls": [_normalise_call(c) for c in calls],
        "page": page,
        "total_chunks": total_chunks,
        "has_next": page + 1 < total_chunks,
    }


def _fetch_calls_chunk(object_id: Any) -> dict[str, Any] | None:
    try:
        from bson import ObjectId
        from dev_utils.mongodb import mongo_find_one
    except ImportError:
        return None
    try:
        oid = object_id if isinstance(object_id, ObjectId) else ObjectId(object_id)
    except Exception:
        return None
    try:
        return mongo_find_one("calls", {"_id": oid})
    except Exception as exc:  # pragma: no cover
        log.warning("calls chunk lookup failed: %s", exc)
        return None


def _normalise_call(call: dict[str, Any]) -> dict[str, Any]:
    """Project a raw API-call record onto the shape the SPA expects."""
    args = call.get("arguments") or call.get("args") or []
    if isinstance(args, dict):
        args = [{"name": k, "value": v} for k, v in args.items()]
    return {
        "id": call.get("id") or call.get("_id"),
        "thread_id": call.get("thread_id") or call.get("tid"),
        "category": call.get("category"),
        "api": call.get("api") or call.get("name"),
        "status": call.get("status"),
        "return_value": call.get("return") if "return" in call else call.get("return_value"),
        "timestamp": call.get("timestamp") or call.get("time"),
        "arguments": args[:30],
    }


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
