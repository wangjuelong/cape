"""Integration tests for GET /api/v3/users/ admin user list."""
import pytest
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    admin = User.objects.create_user(username="admin-tst", password="x", is_staff=True, is_superuser=True)
    c = APIClient()
    c.force_authenticate(user=admin)
    return c, admin


@pytest.fixture
def regular_client():
    user = User.objects.create_user(username="user-tst", password="x")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, user


@pytest.mark.django_db
def test_list_returns_admin_self(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/users/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body and "next_cursor" in body and "total" in body
    assert any(u["username"] == "admin-tst" for u in body["data"])


@pytest.mark.django_db
def test_list_search_username(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="alice")
    User.objects.create_user(username="bob")
    resp = c.get("/api/v3/users/?search=alic")
    names = {u["username"] for u in resp.json()["data"]}
    assert "alice" in names and "bob" not in names


@pytest.mark.django_db
def test_list_filter_is_superuser(admin_client):
    c, admin = admin_client
    User.objects.create_user(username="alice", is_superuser=False)
    User.objects.create_user(username="bob", is_superuser=True)
    resp = c.get("/api/v3/users/?is_superuser=true")
    names = {u["username"] for u in resp.json()["data"]}
    assert "bob" in names and "alice" not in names


@pytest.mark.django_db
def test_list_pagination_limit(admin_client):
    c, _ = admin_client
    for i in range(25):
        User.objects.create_user(username=f"u{i}")
    resp = c.get("/api/v3/users/?limit=5")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 5
    assert body["next_cursor"] is not None


@pytest.mark.django_db
def test_list_rejects_non_staff(regular_client):
    c, _ = regular_client
    assert c.get("/api/v3/users/").status_code == 403


@pytest.mark.django_db
def test_list_rejects_anonymous():
    assert APIClient().get("/api/v3/users/").status_code == 401


@pytest.mark.django_db
def test_users_list_filter_has_token_yes(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob")  # no token

    resp = c.get("/api/v3/users/?has_token=yes")
    usernames = {row["username"] for row in resp.json()["data"]}
    # bob excluded.
    assert "bob" not in usernames
    assert {"alice"} <= usernames


@pytest.mark.django_db
def test_users_list_filter_has_token_no(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob")  # no token

    resp = c.get("/api/v3/users/?has_token=no")
    usernames = {row["username"] for row in resp.json()["data"]}
    # alice + admin excluded.
    assert "alice" not in usernames
    assert "bob" in usernames
