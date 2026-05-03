import pytest
from django.contrib.auth.models import Group, Permission, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gc", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_create_basic(admin_client):
    c, _ = admin_client
    resp = c.post("/api/v3/groups/", {"name": "moderators"}, format="json")
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "moderators"
    assert body["permission_ids"] == []
    assert Group.objects.filter(name="moderators").exists()


@pytest.mark.django_db
def test_create_with_permissions(admin_client):
    c, _ = admin_client
    p = Permission.objects.first()
    resp = c.post(
        "/api/v3/groups/",
        {"name": "perm-grp", "permission_ids": [p.id]},
        format="json",
    )
    assert resp.status_code == 201
    g = Group.objects.get(name="perm-grp")
    assert list(g.permissions.values_list("id", flat=True)) == [p.id]


@pytest.mark.django_db
def test_create_audit_emitted(admin_client):
    from audit_log.models import AuditEvent
    c, admin = admin_client
    AuditEvent.objects.filter(action="group_create").delete()
    c.post("/api/v3/groups/", {"name": "audited"}, format="json")
    events = AuditEvent.objects.filter(action="group_create")
    assert events.count() == 1
    assert events.first().target_label == "audited"


@pytest.mark.django_db
def test_create_duplicate_name_400(admin_client):
    c, _ = admin_client
    Group.objects.create(name="dup")
    resp = c.post("/api/v3/groups/", {"name": "dup"}, format="json")
    assert resp.status_code == 400
    assert "name" in resp.json()


@pytest.mark.django_db
def test_create_rejects_non_staff():
    c = APIClient()
    c.force_authenticate(user=User.objects.create_user(username="reg"))
    assert c.post("/api/v3/groups/", {"name": "x"}, format="json").status_code == 403
