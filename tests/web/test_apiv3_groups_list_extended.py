"""Extended GET /api/v3/groups/ — envelope + member_count + search + cursor pagination."""
import pytest
from django.contrib.auth.models import Group, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-gl", password="x", is_staff=True)
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
def test_list_returns_envelope(admin_client):
    c, _ = admin_client
    Group.objects.create(name="moderators")
    resp = c.get("/api/v3/groups/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "next_cursor" in body
    assert "total" in body
    names = {g["name"] for g in body["data"]}
    assert "moderators" in names


@pytest.mark.django_db
def test_list_includes_member_count(admin_client):
    c, _ = admin_client
    g = Group.objects.create(name="readers")
    u1 = User.objects.create_user(username="u1")
    u2 = User.objects.create_user(username="u2")
    g.user_set.add(u1, u2)
    resp = c.get("/api/v3/groups/")
    row = next(r for r in resp.json()["data"] if r["name"] == "readers")
    assert row["member_count"] == 2


@pytest.mark.django_db
def test_list_search(admin_client):
    c, _ = admin_client
    Group.objects.create(name="alpha")
    Group.objects.create(name="beta")
    resp = c.get("/api/v3/groups/?search=alph")
    names = {g["name"] for g in resp.json()["data"]}
    assert "alpha" in names and "beta" not in names


@pytest.mark.django_db
def test_list_pagination_limit(admin_client):
    c, _ = admin_client
    for i in range(25):
        Group.objects.create(name=f"g{i:02d}")
    resp = c.get("/api/v3/groups/?limit=5")
    body = resp.json()
    assert len(body["data"]) == 5
    assert body["next_cursor"] is not None


@pytest.mark.django_db
def test_list_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient()
    c.force_authenticate(user=user)
    assert c.get("/api/v3/groups/").status_code == 403


@pytest.mark.django_db
def test_list_rejects_anonymous():
    assert APIClient().get("/api/v3/groups/").status_code == 401
