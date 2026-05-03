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
    a = User.objects.create_user(username="adm-set", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_set_password(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    resp = c.post(
        f"/api/v3/users/{t.id}/set-password/",
        {"password": "ResetPass987Strong!"}, format="json",
    )
    assert resp.status_code == 204
    t.refresh_from_db()
    assert t.check_password("ResetPass987Strong!")


@pytest.mark.django_db
def test_set_password_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="bob")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_set_password").delete()
    c.post(
        f"/api/v3/users/{t.id}/set-password/",
        {"password": "ResetPass987Strong!"}, format="json",
    )
    assert AuditEvent.objects.filter(action="user_set_password").count() == 1


@pytest.mark.django_db
def test_activate(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=False)
    resp = c.post(f"/api/v3/users/{t.id}/activate/")
    assert resp.status_code == 200
    t.refresh_from_db()
    assert t.is_active is True


@pytest.mark.django_db
def test_deactivate(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=True)
    resp = c.post(f"/api/v3/users/{t.id}/deactivate/")
    assert resp.status_code == 200
    t.refresh_from_db()
    assert t.is_active is False


@pytest.mark.django_db
def test_deactivate_self_400(admin_client):
    c, admin = admin_client
    resp = c.post(f"/api/v3/users/{admin.id}/deactivate/")
    assert resp.status_code == 400
    admin.refresh_from_db()
    assert admin.is_active is True


@pytest.mark.django_db
def test_activate_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=False)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_activate").delete()
    c.post(f"/api/v3/users/{t.id}/activate/")
    assert AuditEvent.objects.filter(action="user_activate").count() == 1
