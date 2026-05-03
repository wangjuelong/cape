import pytest
from django.contrib.auth.models import Group, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gd2", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_delete_basic(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="todel")
    resp = c.delete(f"/api/v3/groups/{g.id}/")
    assert resp.status_code == 204
    assert not Group.objects.filter(pk=g.id).exists()


@pytest.mark.django_db
def test_delete_severs_user_membership(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="g")
    u = User.objects.create_user(username="u")
    g.user_set.add(u)
    c.delete(f"/api/v3/groups/{g.id}/")
    u.refresh_from_db()
    assert u.groups.count() == 0  # m2m row gone but user kept


@pytest.mark.django_db
def test_delete_audit(admin_client):
    from audit_log.models import AuditEvent
    c, _ = admin_client
    g = Group.objects.create(name="auditme")
    AuditEvent.objects.filter(action="group_delete").delete()
    c.delete(f"/api/v3/groups/{g.id}/")
    events = AuditEvent.objects.filter(action="group_delete")
    assert events.count() == 1
    assert events.first().target_label == "auditme"


@pytest.mark.django_db
def test_bulk_delete(admin_client):
    c, _ = admin_client
    g1 = Group.objects.create(name="b1")
    g2 = Group.objects.create(name="b2")
    resp = c.post(
        "/api/v3/groups/bulk-delete/",
        {"ids": [g1.id, g2.id]}, format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["success"]) == {g1.id, g2.id}
    assert body["failed"] == []
    assert not Group.objects.filter(pk__in=[g1.id, g2.id]).exists()


@pytest.mark.django_db
def test_bulk_delete_partial(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="real")
    resp = c.post(
        "/api/v3/groups/bulk-delete/",
        {"ids": [g.id, 99999]}, format="json",
    )
    body = resp.json()
    assert g.id in body["success"]
    assert any(f["id"] == 99999 for f in body["failed"])
