"""GET /api/v3/groups/<id>/ — admin only, full shape, 404 on unknown."""
import pytest
from django.contrib.auth.models import Group, Permission, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gd", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_detail_returns_full_shape(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="moderators")
    p = Permission.objects.first()
    g.permissions.add(p)
    resp = c.get(f"/api/v3/groups/{g.id}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "moderators"
    assert body["permission_ids"] == [p.id]
    assert body["member_count"] == 0


@pytest.mark.django_db
def test_detail_404_unknown(admin_client):
    c, _ = admin_client
    assert c.get("/api/v3/groups/99999/").status_code == 404


@pytest.mark.django_db
def test_detail_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient()
    c.force_authenticate(user=user)
    g = Group.objects.create(name="g")
    assert c.get(f"/api/v3/groups/{g.id}/").status_code == 403
