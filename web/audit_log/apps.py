"""Django app config for audit_log.

Connects signal handlers in `signals.py` once the app is ready. Signals
are imported lazily (inside `ready()`) so test harnesses that import the
model directly don't trigger circular imports.
"""

import logging

from django.apps import AppConfig

log = logging.getLogger(__name__)


class AuditLogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "audit_log"
    verbose_name = "Audit log"

    def ready(self):
        try:
            from . import signals  # noqa: F401
        except ImportError:
            # signals.py is added in Task 4 — until then, audit_log boots
            # without signal handlers (model + helpers still work for tests).
            log.warning("audit_log.signals not yet present — signal-driven capture inactive")
