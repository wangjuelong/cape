"""Report retrieval service — single point of contact with MongoDB / ES.

This module centralises every Mongo field path used by v3 endpoints, so
that schema renames or store migrations only require touching one file
(PRD §9 R7). v3 report views MUST go through helpers here; they MUST NOT
call ``mongo_find_*`` directly.

Skeleton only — concrete methods land alongside their consuming endpoints
during stage 3 (W8-W14, report page).
"""

from __future__ import annotations

from typing import Any

# Centralised projection definitions. Each entry is a Mongo projection
# returning the smallest set of fields a v3 endpoint needs.
_PROJECTIONS: dict[str, dict[str, int]] = {
    "summary": {
        "info": 1,
        "target": 1,
        "malscore": 1,
        "detections": 1,
        "signatures.severity": 1,
        "signatures.name": 1,
        "network.hosts": 1,
        "network.domains": 1,
        "_id": 0,
    },
    "static": {
        "static": 1,
        "target.file.pe": 1,
        "target.file.office": 1,
        "target.file.pdf": 1,
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


def fetch_report_section(_task_id: int, _section: str) -> dict[str, Any] | None:
    """Returns a Mongo doc filtered by the projection registered for
    ``section``. Implementation lands in stage 3 W8.
    """
    raise NotImplementedError("fetch_report_section: implement in stage 3 W8")


def list_sections(_task_id: int) -> list[str]:
    """Returns the subset of report section names that have non-empty
    data for the given task. The SPA uses this to decide which tabs to
    show (PRD report-page-spec §2 ``available_sections``).
    """
    raise NotImplementedError("list_sections: implement in stage 3 W8")
