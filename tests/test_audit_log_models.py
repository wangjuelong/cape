"""Smoke tests for the AuditEvent model."""

import pytest


@pytest.mark.django_db
def test_audit_event_minimal_insert():
    from audit_log.models import AuditEvent

    e = AuditEvent.objects.create(action="login_success")
    assert e.id is not None
    assert e.action == "login_success"
    assert e.success is True
    assert e.metadata == {}


@pytest.mark.django_db
def test_audit_event_full_insert():
    from audit_log.models import AuditEvent

    e = AuditEvent.objects.create(
        action="ban_user",
        actor_user_id=5,
        actor_username="admin",
        actor_ip="192.168.1.5",
        actor_user_agent="Mozilla/5.0",
        success=True,
        target_type="user",
        target_id="7",
        target_label="user:bob",
        metadata={"reason": "spam"},
    )
    assert e.metadata["reason"] == "spam"
    assert e.target_label == "user:bob"


@pytest.mark.django_db
def test_audit_event_indexes_present():
    """Sanity: makemigrations actually emitted the 4 indexes the spec
    requires. Without these, /api/v3/audits/ filter queries scan the
    full table."""
    from audit_log.models import AuditEvent

    indexes = AuditEvent._meta.indexes
    fields_per_index = [tuple(idx.fields) for idx in indexes]
    assert ("-timestamp",) in fields_per_index
    assert ("actor_user_id", "-timestamp") in fields_per_index
    assert ("target_type", "target_id", "-timestamp") in fields_per_index
    assert ("action", "-timestamp") in fields_per_index
