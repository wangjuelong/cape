import pytest
from django.contrib.auth.models import Group, Permission, User
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-grp", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_groups_list(admin_client):
    c, _ = admin_client
    Group.objects.create(name="moderators")
    Group.objects.create(name="readers")
    resp = c.get("/api/v3/groups/")
    assert resp.status_code == 200
    names = {g["name"] for g in resp.json()["data"]}
    assert {"moderators", "readers"} <= names


@pytest.mark.django_db
def test_permissions_list(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/permissions/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    sample = body["data"][0]
    assert {"id", "name", "codename", "content_type"} <= set(sample.keys())


@pytest.mark.django_db
def test_permissions_filter_content_type(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/permissions/?content_type=auth.user")
    assert resp.status_code == 200
    for p in resp.json()["data"]:
        assert p["content_type"]["app_label"] == "auth"
        assert p["content_type"]["model"] == "user"


@pytest.mark.django_db
def test_set_groups(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    g1 = Group.objects.create(name="g1")
    g2 = Group.objects.create(name="g2")
    resp = c.patch(
        f"/api/v3/users/{t.id}/groups/",
        {"group_ids": [g1.id, g2.id]}, format="json",
    )
    assert resp.status_code == 200
    assert set(t.groups.values_list("id", flat=True)) == {g1.id, g2.id}


@pytest.mark.django_db
def test_set_permissions(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    p = Permission.objects.first()
    resp = c.patch(
        f"/api/v3/users/{t.id}/permissions/",
        {"permission_ids": [p.id]}, format="json",
    )
    assert resp.status_code == 200
    assert set(t.user_permissions.values_list("id", flat=True)) == {p.id}


@pytest.mark.django_db
def test_set_groups_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    g = Group.objects.create(name="g")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_update").delete()
    c.patch(
        f"/api/v3/users/{t.id}/groups/",
        {"group_ids": [g.id]}, format="json",
    )
    events = AuditEvent.objects.filter(action="user_update")
    assert events.count() == 1
    assert events.first().metadata.get("groups_changed") is True
