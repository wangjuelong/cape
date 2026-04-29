"""Machine-centric service layer.

Wraps the SQLAlchemy ``Database`` machine accessors and projects rows into
the flat dict shape consumed by /api/v3/machines/.
"""

from __future__ import annotations

from typing import Any

from lib.cuckoo.core.database import Database

_db = Database()


def list_machines() -> list[dict[str, Any]]:
    """Returns every registered VM as a flat dict.

    Field set is curated to match what the SPA Machines page needs; it
    intentionally omits internal SQLAlchemy state columns.
    """
    return [_to_dict(machine) for machine in _db.list_machines()]


def view_machine(name: str) -> dict[str, Any] | None:
    machine = _db.view_machine(name)
    return _to_dict(machine) if machine else None


def _to_dict(machine: Any) -> dict[str, Any]:
    return {
        "name": machine.name,
        "label": machine.label,
        "ip": machine.ip,
        "platform": machine.platform,
        "tags": [t.name for t in (machine.tags or [])],
        "status": machine.status,
        "locked": machine.locked,
        "locked_changed_on": _iso(getattr(machine, "locked_changed_on", None)),
        "snapshot": machine.snapshot,
        "interface": machine.interface,
        "reserved": machine.reserved,
    }


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
