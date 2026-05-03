import pytest
from django.contrib.auth.models import Group, Permission, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gu", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_patch_rename(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="oldname")
    resp = c.patch(f"/api/v3/groups/{g.id}/", {"name": "newname"}, format="json")
    assert resp.status_code == 200
    g.refresh_from_db()
    assert g.name == "newname"


@pytest.mark.django_db
def test_patch_set_permissions(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="g")
    p1 = Permission.objects.all()[0]
    p2 = Permission.objects.all()[1]
    resp = c.patch(
        f"/api/v3/groups/{g.id}/",
        {"permission_ids": [p1.id, p2.id]},
        format="json",
    )
    assert resp.status_code == 200
    assert set(g.permissions.values_list("id", flat=True)) == {p1.id, p2.id}


@pytest.mark.django_db
def test_patch_unknown_field_400(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="g")
    resp = c.patch(f"/api/v3/groups/{g.id}/", {"hacked": True}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_rename_to_existing_400(admin_client):
    c, _ = admin_client
    Group.objects.create(name="taken")
    g = Group.objects.create(name="orig")
    resp = c.patch(f"/api/v3/groups/{g.id}/", {"name": "taken"}, format="json")
    assert resp.status_code == 400
    g.refresh_from_db()
    assert g.name == "orig"


@pytest.mark.django_db
def test_patch_audit_emitted(admin_client):
    from audit_log.models import AuditEvent
    c, _ = admin_client
    g = Group.objects.create(name="orig")
    AuditEvent.objects.filter(action="group_update").delete()
    c.patch(f"/api/v3/groups/{g.id}/", {"name": "renamed"}, format="json")
    events = AuditEvent.objects.filter(action="group_update")
    assert events.count() == 1
    assert "name" in events.first().metadata.get("fields", [])
