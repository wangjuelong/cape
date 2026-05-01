"""Verify utils.audit_prune deletes only events older than --days."""

from datetime import timedelta

import pytest
from django.utils import timezone


@pytest.mark.django_db
def test_prune_deletes_old_events_only():
    from audit_log.models import AuditEvent
    from utils.audit_prune import prune

    now = timezone.now()
    fresh = AuditEvent.objects.create(action="login_success", timestamp=now - timedelta(days=10))
    boundary_keep = AuditEvent.objects.create(action="login_success", timestamp=now - timedelta(days=89))
    boundary_drop = AuditEvent.objects.create(action="login_success", timestamp=now - timedelta(days=91))
    very_old = AuditEvent.objects.create(action="login_success", timestamp=now - timedelta(days=400))

    deleted = prune(days=90)

    assert deleted == 2  # boundary_drop + very_old
    surviving_ids = set(AuditEvent.objects.values_list("id", flat=True))
    assert fresh.id in surviving_ids
    assert boundary_keep.id in surviving_ids
    assert boundary_drop.id not in surviving_ids
    assert very_old.id not in surviving_ids


@pytest.mark.django_db
def test_prune_default_window_is_90_days():
    from utils.audit_prune import _DEFAULT_DAYS
    assert _DEFAULT_DAYS == 90
