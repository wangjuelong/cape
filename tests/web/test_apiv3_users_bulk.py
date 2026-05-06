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
    a = User.objects.create_user(username="adm-blk", password="x", is_staff=True, is_superuser=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_bulk_activate(admin_client):
    c, _ = admin_client
    a = User.objects.create_user(username="a", is_active=False)
    b = User.objects.create_user(username="b", is_active=False)
    resp = c.post(
        "/api/v3/users/bulk-action/",
        {"ids": [a.id, b.id], "action": "activate"}, format="json",
    )
    assert resp.status_code == 200
    a.refresh_from_db(); b.refresh_from_db()
    assert a.is_active and b.is_active
    body = resp.json()
    assert set(body["success"]) == {a.id, b.id}
    assert body["failed"] == []


@pytest.mark.django_db
def test_bulk_delete_skips_self(admin_client):
    c, admin = admin_client
    a = User.objects.create_user(username="a")
    resp = c.post(
        "/api/v3/users/bulk-action/",
        {"ids": [a.id, admin.id], "action": "delete"}, format="json",
    )
    body = resp.json()
    assert a.id in body["success"]
    assert any(f["id"] == admin.id for f in body["failed"])


@pytest.mark.django_db
def test_bulk_unknown_action_400(admin_client):
    c, _ = admin_client
    resp = c.post(
        "/api/v3/users/bulk-action/",
        {"ids": [1], "action": "explode"}, format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_bulk_audit(admin_client):
    c, _ = admin_client
    a = User.objects.create_user(username="a", is_active=False)
    b = User.objects.create_user(username="b", is_active=False)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_activate").delete()
    c.post(
        "/api/v3/users/bulk-action/",
        {"ids": [a.id, b.id], "action": "activate"}, format="json",
    )
    assert AuditEvent.objects.filter(action="user_activate").count() == 2
