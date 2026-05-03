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
    a = User.objects.create_user(username="admin-del", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.fixture
def superuser_client():
    a = User.objects.create_user(username="su-del", password="x", is_staff=True, is_superuser=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_delete_basic(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="todel")
    resp = c.delete(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 204
    assert not User.objects.filter(pk=target.id).exists()


@pytest.mark.django_db
def test_delete_self_400(admin_client):
    c, admin = admin_client
    assert c.delete(f"/api/v3/users/{admin.id}/").status_code == 400
    assert User.objects.filter(pk=admin.id).exists()


@pytest.mark.django_db
def test_delete_superuser_by_non_superuser_400(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="su", is_superuser=True)
    resp = c.delete(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 400
    assert User.objects.filter(pk=target.id).exists()


@pytest.mark.django_db
def test_delete_superuser_by_superuser_ok(superuser_client):
    c, _ = superuser_client
    target = User.objects.create_user(username="su2", is_superuser=True)
    assert c.delete(f"/api/v3/users/{target.id}/").status_code == 204


@pytest.mark.django_db
def test_delete_audit_emitted(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="logme")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_delete").delete()
    c.delete(f"/api/v3/users/{target.id}/")
    assert AuditEvent.objects.filter(action="user_delete").count() == 1
