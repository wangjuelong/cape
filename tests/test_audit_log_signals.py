"""Integration tests: trigger Django/allauth signals and assert that an
audit_events row appears with the correct action + actor + metadata."""

import pytest
from django.contrib.auth import get_user_model


@pytest.fixture
def alice(db):
    User = get_user_model()
    return User.objects.create_user(username="alice", password="alicepw1234", email="alice@cape.local")


@pytest.mark.django_db
def test_login_success_creates_audit_row(alice, client):
    from audit_log.models import AuditEvent

    ok = client.login(username="alice", password="alicepw1234")
    assert ok is True

    rows = list(AuditEvent.objects.filter(action="login_success"))
    assert len(rows) == 1
    assert rows[0].actor_user_id == alice.id
    assert rows[0].actor_username == "alice"
    assert rows[0].success is True


@pytest.mark.django_db
def test_login_failed_creates_audit_row(alice):
    """Send the user_login_failed signal directly. Django's test
    client.login(...) doesn't always emit it for credential-mismatch
    cases (depends on backend); the explicit signal send proves our
    receiver works."""
    from django.contrib.auth.signals import user_login_failed
    from audit_log.models import AuditEvent

    user_login_failed.send(
        sender=None,
        credentials={"username": "alice"},
        request=None,
    )

    rows = list(AuditEvent.objects.filter(action="login_failed"))
    assert len(rows) == 1
    assert rows[0].success is False
    assert rows[0].metadata.get("attempted_username") == "alice"


@pytest.mark.django_db
def test_logout_creates_audit_row(alice, client):
    from audit_log.models import AuditEvent

    client.login(username="alice", password="alicepw1234")
    AuditEvent.objects.all().delete()  # clear the login_success row

    client.logout()

    rows = list(AuditEvent.objects.filter(action="logout"))
    assert len(rows) == 1
    assert rows[0].actor_username == "alice"
