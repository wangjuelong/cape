import pytest
from django.contrib.auth.models import Group, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gm", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_members_get(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="g")
    u1 = User.objects.create_user(username="m1")
    u2 = User.objects.create_user(username="m2")
    g.user_set.add(u1, u2)
    resp = c.get(f"/api/v3/groups/{g.id}/members/")
    assert resp.status_code == 200
    body = resp.json()
    names = {r["username"] for r in body["data"]}
    assert names == {"m1", "m2"}
    assert body["total"] == 2


@pytest.mark.django_db
def test_members_get_empty(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="empty")
    resp = c.get(f"/api/v3/groups/{g.id}/members/")
    assert resp.status_code == 200
    assert resp.json()["data"] == []
    assert resp.json()["total"] == 0


@pytest.mark.django_db
def test_members_set(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="g")
    u1 = User.objects.create_user(username="a")
    u2 = User.objects.create_user(username="b")
    resp = c.patch(
        f"/api/v3/groups/{g.id}/members/",
        {"user_ids": [u1.id, u2.id]}, format="json",
    )
    assert resp.status_code == 200
    assert set(g.user_set.values_list("id", flat=True)) == {u1.id, u2.id}


@pytest.mark.django_db
def test_members_set_audit(admin_client):
    from audit_log.models import AuditEvent
    c, _ = admin_client
    g = Group.objects.create(name="g")
    u = User.objects.create_user(username="x")
    AuditEvent.objects.filter(action="group_update").delete()
    c.patch(f"/api/v3/groups/{g.id}/members/",
            {"user_ids": [u.id]}, format="json")
    events = AuditEvent.objects.filter(action="group_update")
    assert events.count() == 1
    assert events.first().metadata.get("members_changed") is True
