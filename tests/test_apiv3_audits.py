"""apiv3 audits endpoint tests."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone


@pytest.fixture
def staff_user(db):
    User = get_user_model()
    u = User.objects.create_user(username="staff", password="staffpw1234", email="s@x", is_staff=True)
    return u


@pytest.fixture
def normal_user(db):
    User = get_user_model()
    return User.objects.create_user(username="normal", password="normalpw1234", email="n@x")


@pytest.fixture
def staff_client(staff_user):
    c = Client()
    c.login(username="staff", password="staffpw1234")
    return c


@pytest.fixture
def normal_client(normal_user):
    c = Client()
    c.login(username="normal", password="normalpw1234")
    return c


@pytest.fixture
def seed_events(db):
    from audit_log.models import AuditEvent

    now = timezone.now()
    AuditEvent.objects.create(action="login_success", actor_username="alice",
                              actor_ip="1.1.1.1", timestamp=now - timedelta(minutes=1))
    AuditEvent.objects.create(action="login_failed", actor_username=None,
                              actor_ip="2.2.2.2", success=False,
                              metadata={"attempted_username": "alice"},
                              timestamp=now - timedelta(minutes=2))
    AuditEvent.objects.create(action="ban_user", actor_username="admin",
                              actor_ip="3.3.3.3", target_type="user",
                              target_id="42", target_label="user:bob",
                              metadata={"reason": "spam"},
                              timestamp=now - timedelta(minutes=3))


@pytest.mark.django_db
def test_audits_list_anonymous_401_or_403():
    c = Client()
    resp = c.get("/api/v3/audits/")
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_audits_list_normal_user_403(normal_client, seed_events):
    resp = normal_client.get("/api/v3/audits/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_audits_list_staff_returns_data_desc(staff_client, seed_events):
    resp = staff_client.get("/api/v3/audits/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "next_cursor" in body
    actions = [row["action"] for row in body["data"]]
    # Sorted by timestamp DESC: login_success (1m ago), login_failed (2m), ban_user (3m)
    assert actions == ["login_success", "login_failed", "ban_user"]


@pytest.mark.django_db
def test_audits_list_filter_by_action(staff_client, seed_events):
    resp = staff_client.get("/api/v3/audits/?action=login_failed")
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 1
    assert rows[0]["action"] == "login_failed"


@pytest.mark.django_db
def test_audits_list_filter_by_actor(staff_client, seed_events):
    resp = staff_client.get("/api/v3/audits/?actor=alice")
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 1
    assert rows[0]["actor"]["username"] == "alice"


@pytest.mark.django_db
def test_audits_list_filter_by_success(staff_client, seed_events):
    resp = staff_client.get("/api/v3/audits/?success=false")
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 1
    assert rows[0]["success"] is False


@pytest.mark.django_db
def test_audits_list_pagination(staff_client, db):
    """20 events, limit=5, follow next_cursor 4 times."""
    from audit_log.models import AuditEvent

    now = timezone.now()
    for i in range(20):
        AuditEvent.objects.create(action="login_success",
                                  actor_username=f"u{i}",
                                  timestamp=now - timedelta(seconds=i))

    seen_actors = []
    cursor = None
    for _ in range(5):  # safety bound
        url = "/api/v3/audits/?limit=5"
        if cursor:
            url += f"&cursor={cursor}"
        resp = staff_client.get(url)
        assert resp.status_code == 200
        body = resp.json()
        seen_actors.extend(row["actor"]["username"] for row in body["data"])
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert len(seen_actors) == 20
    # All distinct
    assert len(set(seen_actors)) == 20
