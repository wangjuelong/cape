"""Integration tests for GET /api/v3/users/<id>/ admin user detail."""
import pytest
from django.contrib.auth.models import Group, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    admin = User.objects.create_user(username="admin-d", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=admin)
    return c, admin


@pytest.mark.django_db
def test_detail_returns_full_shape(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice", email="a@x.com")
    g = Group.objects.create(name="testgroup")
    target.groups.add(g)
    resp = c.get(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "alice"
    assert body["group_ids"] == [g.id]
    assert "permission_ids" in body
    assert "userprofile" in body
    assert "has_token" in body


@pytest.mark.django_db
def test_detail_404_for_unknown(admin_client):
    c, _ = admin_client
    assert c.get("/api/v3/users/99999/").status_code == 404


@pytest.mark.django_db
def test_detail_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient()
    c.force_authenticate(user=user)
    target = User.objects.create_user(username="someone")
    assert c.get(f"/api/v3/users/{target.id}/").status_code == 403
