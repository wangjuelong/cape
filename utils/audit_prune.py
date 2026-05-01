#!/usr/bin/env python3
"""Delete audit_events rows older than --days (default 90).

This is the ONLY supported DELETE path against the audit_events table.
All other code paths must treat it as append-only.

Usage:
    python utils/audit_prune.py [--days N] [--dry-run]

Run from systemd timer or cron. The systemd unit lives at
`systemd/cape-audit-prune.timer`.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import timedelta

# Bootstrap Django when invoked directly.
if __name__ == "__main__":
    HERE = os.path.dirname(os.path.abspath(__file__))
    REPO = os.path.dirname(HERE)
    sys.path.insert(0, os.path.join(REPO, "web"))
    sys.path.insert(0, REPO)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "web.settings")
    import django
    django.setup()

from django.utils import timezone

log = logging.getLogger("audit_prune")

_DEFAULT_DAYS = 90


def prune(days: int = _DEFAULT_DAYS, dry_run: bool = False) -> int:
    """Delete events with timestamp < now - days. Returns number deleted."""
    from audit_log.models import AuditEvent

    cutoff = timezone.now() - timedelta(days=days)
    qs = AuditEvent.objects.filter(timestamp__lt=cutoff)
    count = qs.count()
    if dry_run:
        log.info("[dry-run] would delete %d audit_events older than %s", count, cutoff.isoformat())
        return count
    deleted, _ = qs.delete()
    log.info("audit_prune: deleted %d events older than %s", deleted, cutoff.isoformat())
    return deleted


def _main() -> int:
    parser = argparse.ArgumentParser(description="Prune audit_events older than --days")
    parser.add_argument("--days", type=int, default=_DEFAULT_DAYS, help="retention window in days (default 90)")
    parser.add_argument("--dry-run", action="store_true", help="report count without deleting")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
    )
    prune(days=args.days, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
