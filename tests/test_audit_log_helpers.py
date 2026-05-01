"""Unit tests for the audit_log.helpers.log() write helper."""

import logging
from unittest import mock

import pytest


@pytest.mark.django_db
def test_log_writes_minimal_event():
    from audit_log import helpers
    from audit_log.models import AuditEvent

    helpers.log("login_success")

    rows = list(AuditEvent.objects.all())
    assert len(rows) == 1
    assert rows[0].action == "login_success"
    assert rows[0].success is True
    assert rows[0].metadata == {}


@pytest.mark.django_db
def test_log_uses_explicit_actor_over_request():
    from audit_log import helpers
    from audit_log.models import AuditEvent

    fake_request = mock.Mock()
    fake_request.user = mock.Mock(is_authenticated=True, id=99, username="from_request")
    fake_request.META = {"REMOTE_ADDR": "1.2.3.4", "HTTP_USER_AGENT": "ua-from-request"}

    explicit_actor = mock.Mock(id=5, username="explicit_admin")

    helpers.log("ban_user", request=fake_request, actor=explicit_actor)

    row = AuditEvent.objects.get()
    assert row.actor_user_id == 5
    assert row.actor_username == "explicit_admin"
    # IP / UA still pulled from request even when actor is overridden
    assert row.actor_ip == "1.2.3.4"
    assert row.actor_user_agent == "ua-from-request"


@pytest.mark.django_db
def test_log_pulls_actor_from_request_when_not_explicit():
    from audit_log import helpers
    from audit_log.models import AuditEvent

    fake_request = mock.Mock()
    fake_request.user = mock.Mock(is_authenticated=True, id=42, username="alice")
    fake_request.META = {"REMOTE_ADDR": "10.0.0.1", "HTTP_USER_AGENT": "Mozilla"}

    helpers.log("logout", request=fake_request)

    row = AuditEvent.objects.get()
    assert row.actor_user_id == 42
    assert row.actor_username == "alice"


@pytest.mark.django_db
def test_log_anonymous_when_no_request_no_actor():
    from audit_log import helpers
    from audit_log.models import AuditEvent

    helpers.log("login_failed", success=False, attempted_username="root")

    row = AuditEvent.objects.get()
    assert row.actor_user_id is None
    assert row.actor_username is None
    assert row.actor_ip is None
    assert row.success is False
    assert row.metadata == {"attempted_username": "root"}


@pytest.mark.django_db
def test_log_redacts_sensitive_metadata_keys():
    from audit_log import helpers
    from audit_log.models import AuditEvent

    helpers.log(
        "test",
        password="hunter2",
        api_token="abc123",
        AUTHORIZATION="Bearer xyz",
        secret_key="s3cr3t",
        cookie_value="sid=...",
        normal_field="visible",
    )

    row = AuditEvent.objects.get()
    md = row.metadata
    assert md["password"] == "[REDACTED]"
    assert md["api_token"] == "[REDACTED]"
    assert md["AUTHORIZATION"] == "[REDACTED]"
    assert md["secret_key"] == "[REDACTED]"
    assert md["cookie_value"] == "[REDACTED]"
    assert md["normal_field"] == "visible"


@pytest.mark.django_db
def test_log_serializes_unjsonable_metadata_values():
    """datetime, Decimal, Path etc. don't break the call — they get
    str()-coerced so the row still lands."""
    import datetime
    from decimal import Decimal

    from audit_log import helpers
    from audit_log.models import AuditEvent

    helpers.log(
        "test",
        when=datetime.datetime(2026, 5, 1, 12, 0, 0),
        amount=Decimal("3.14"),
    )

    row = AuditEvent.objects.get()
    assert "2026-05-01" in row.metadata["when"]
    assert row.metadata["amount"] == "3.14"


@pytest.mark.django_db
def test_log_swallows_db_failures(caplog):
    """Writing to the DB MUST NOT raise — it would crash the actual
    business request (login, ban_user, etc). Failures are logged and
    swallowed."""
    from audit_log import helpers

    with mock.patch(
        "audit_log.models.AuditEvent.objects.create",
        side_effect=RuntimeError("simulated db outage"),
    ), caplog.at_level(logging.ERROR, logger="audit_log.helpers"):
        # Must NOT raise:
        helpers.log("login_success")

    assert any("audit log write failed" in r.message.lower() for r in caplog.records)
