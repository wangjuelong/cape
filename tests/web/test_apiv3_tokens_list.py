"""GET /api/v3/tokens/ — admin aggregated list of users + token status."""
import pytest
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_client():
    a = User.objects.create_user(
        username="adm-tk", email="adm@example.com", password="x", is_staff=True
    )
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_tokens_list_returns_envelope_and_token_status(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)  # admin has token
    alice = User.objects.create_user(username="alice", email="alice@example.com")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob", email="bob@example.com")  # no token

    resp = c.get("/api/v3/tokens/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body and "next_cursor" in body and "total" in body

    by_username = {row["username"]: row for row in body["data"]}
    assert by_username["adm-tk"]["has_token"] is True
    assert by_username["adm-tk"]["token_created"] is not None
    assert by_username["alice"]["has_token"] is True
    assert by_username["bob"]["has_token"] is False
    assert by_username["bob"]["token_created"] is None
    # Required columns are present in every row.
    for row in body["data"]:
        for key in (
            "user_id", "username", "email",
            "is_staff", "is_active", "has_token", "token_created",
        ):
            assert key in row


@pytest.mark.django_db
def test_tokens_list_filter_has_token_yes(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob")  # no token

    resp = c.get("/api/v3/tokens/?has_token=yes")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert usernames == {"adm-tk", "alice"}


@pytest.mark.django_db
def test_tokens_list_filter_has_token_no(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    User.objects.create_user(username="alice")
    User.objects.create_user(username="bob")

    resp = c.get("/api/v3/tokens/?has_token=no")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert usernames == {"alice", "bob"}


@pytest.mark.django_db
def test_tokens_list_search_matches_username_and_email(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="alice", email="alice@example.com")
    User.objects.create_user(username="bob", email="bob@corp.io")

    resp = c.get("/api/v3/tokens/?search=alice")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "alice" in usernames and "bob" not in usernames

    resp = c.get("/api/v3/tokens/?search=corp.io")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "bob" in usernames and "alice" not in usernames


@pytest.mark.django_db
def test_tokens_list_cursor_pagination(admin_client):
    c, _ = admin_client
    # admin (id=1) plus 4 more users — total 5 rows.
    User.objects.create_user(username="u1")
    User.objects.create_user(username="u2")
    User.objects.create_user(username="u3")
    User.objects.create_user(username="u4")

    page1 = c.get("/api/v3/tokens/?limit=2").json()
    assert len(page1["data"]) == 2
    assert page1["next_cursor"] is not None
    assert page1["total"] == 5

    page2 = c.get(f"/api/v3/tokens/?limit=2&cursor={page1['next_cursor']}").json()
    assert len(page2["data"]) == 2
    # Pages 1+2 must not overlap.
    page1_ids = {row["user_id"] for row in page1["data"]}
    page2_ids = {row["user_id"] for row in page2["data"]}
    assert page1_ids.isdisjoint(page2_ids)


@pytest.mark.django_db
def test_tokens_list_forbids_non_staff():
    user = User.objects.create_user(username="reg", password="x")
    c = APIClient()
    c.force_authenticate(user=user)
    assert c.get("/api/v3/tokens/").status_code == 403


@pytest.mark.django_db
def test_tokens_list_forbids_anonymous():
    assert APIClient().get("/api/v3/tokens/").status_code == 401
