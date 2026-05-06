"""Integration tests for /api/v3/me/ PATCH."""
import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle_cache():
    # DRF throttles persist counters in Django's default cache (LocMem in
    # tests). Without a per-test reset, the 7th request in this module trips
    # the user-rate limit and the final test sees 429 instead of 200.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def authed_client():
    user = User.objects.create_user(
        username="me-test", password="cape123!", email="old@example.com"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
def test_patch_updates_email(authed_client):
    client, user = authed_client
    resp = client.patch("/api/v3/me/", {"email": "new@example.com"}, format="json")
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.email == "new@example.com"
    # Response shape mirrors GET /me/
    assert resp.json()["email"] == "new@example.com"
    assert resp.json()["username"] == "me-test"


@pytest.mark.django_db
def test_patch_empty_body_is_noop(authed_client):
    client, user = authed_client
    resp = client.patch("/api/v3/me/", {}, format="json")
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.email == "old@example.com"


@pytest.mark.django_db
def test_patch_rejects_username(authed_client):
    client, _ = authed_client
    resp = client.patch("/api/v3/me/", {"username": "hacker"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_rejects_is_staff(authed_client):
    client, user = authed_client
    resp = client.patch("/api/v3/me/", {"is_staff": True}, format="json")
    assert resp.status_code == 400
    user.refresh_from_db()
    assert user.is_staff is False


@pytest.mark.django_db
def test_patch_writes_audit_log(authed_client):
    from audit_log.models import AuditEvent

    client, user = authed_client
    AuditEvent.objects.all().delete()
    client.patch(
        "/api/v3/me/",
        {"first_name": "Alice", "last_name": "Liddell"},
        format="json",
    )
    events = AuditEvent.objects.filter(action="profile_update")
    assert events.count() == 1
    e = events.first()
    assert e.actor_username == "me-test"
    assert set(e.metadata.get("fields", [])) == {"first_name", "last_name"}


@pytest.mark.django_db
def test_patch_unauthenticated_401():
    resp = APIClient().patch("/api/v3/me/", {"email": "x@y.z"}, format="json")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_get_still_works(authed_client):
    client, _ = authed_client
    resp = client.get("/api/v3/me/")
    assert resp.status_code == 200
    assert resp.json()["username"] == "me-test"


@pytest.mark.django_db
def test_me_view_omits_subscription_and_reports_dl_allowed(authed_client):
    client, _ = authed_client
    resp = client.get("/api/v3/me/")
    assert resp.status_code == 200
    body = resp.json()
    # Sub-spec #8 (strip RBAC) deleted UserProfile entirely; per-user
    # subscription / reports_dl_allowed are gone in favor of global config.
    assert "subscription" not in body
    assert "reports_dl_allowed" not in body
