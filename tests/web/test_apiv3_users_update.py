import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="admin-u", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_patch_basic_fields(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice", email="old@x.com")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"email": "new@x.com", "first_name": "Alice"},
        format="json",
    )
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.email == "new@x.com"
    assert target.first_name == "Alice"


@pytest.mark.django_db
def test_patch_userprofile_inline(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="bob")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"userprofile": {"subscription": "10/m", "reports": True}},
        format="json",
    )
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.userprofile.subscription == "10/m"
    assert target.userprofile.reports is True


@pytest.mark.django_db
def test_patch_non_superuser_cannot_promote_to_superuser(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"is_superuser": True}, format="json",
    )
    assert resp.status_code == 400
    target.refresh_from_db()
    assert target.is_superuser is False


@pytest.mark.django_db
def test_patch_cannot_deactivate_self(admin_client):
    c, admin = admin_client
    resp = c.patch(
        f"/api/v3/users/{admin.id}/",
        {"is_active": False}, format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_audit_emitted(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_update").delete()
    c.patch(f"/api/v3/users/{target.id}/", {"first_name": "Alice"}, format="json")
    events = AuditEvent.objects.filter(action="user_update")
    assert events.count() == 1
    assert "first_name" in events.first().metadata.get("fields", [])
