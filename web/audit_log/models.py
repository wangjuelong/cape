"""Audit log event model.

Lives in `siteauth.sqlite` (Django default DB) so foreign-key reasoning
about `auth_user` is implicit even though we DELIBERATELY don't define
the FK constraint — see spec §4.3 for the snapshot-username rationale.

INSERT only. The single allowed write path is `audit_log.helpers.log()`.
The single allowed DELETE path is `utils/audit_prune.py`. Don't use
`AuditEvent.objects.create()` from business code — use `helpers.log()`
so redaction + try/except wrapping happens consistently.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    # Actor — nullable because anonymous failed-login events have no actor.
    actor_user_id = models.IntegerField(null=True, blank=True)  # bare int, no FK (cross-db; users may be deleted)
    actor_username = models.CharField(max_length=150, null=True, blank=True)
    actor_ip = models.GenericIPAddressField(null=True, blank=True)
    actor_user_agent = models.TextField(null=True, blank=True)

    # Action
    action = models.CharField(max_length=64)
    success = models.BooleanField(default=True)

    # Target — present for user_mgmt / admin events; absent for failed login.
    target_type = models.CharField(max_length=32, null=True, blank=True)
    target_id = models.CharField(max_length=64, null=True, blank=True)
    target_label = models.CharField(max_length=255, null=True, blank=True)

    # Action-specific extra fields. Always a dict (not null).
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "audit_events"
        indexes = [
            models.Index(fields=["-timestamp"]),
            models.Index(fields=["actor_user_id", "-timestamp"]),
            models.Index(fields=["target_type", "target_id", "-timestamp"]),
            models.Index(fields=["action", "-timestamp"]),
        ]

    def __str__(self) -> str:
        return f"AuditEvent({self.action} by={self.actor_username or '?'} at={self.timestamp:%Y-%m-%d %H:%M:%S})"
