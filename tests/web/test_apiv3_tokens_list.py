"""GET /api/v3/tokens/ — admin aggregated list, only users with tokens, includes full key."""
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
    Token.objects.create(user=a)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_tokens_list_returns_envelope_with_full_key(admin_client):
    c, admin = admin_client
    alice = User.objects.create_user(username="alice", email="alice@example.com")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body and "next_cursor" in body and "total" in body

    by_username = {row["username"]: row for row in body["data"]}
    for username in ("adm-tk", "alice"):
        row = by_username[username]
        assert row["has_token"] is True
        assert row["token_created"] is not None
        # key is the full 40-char hex DRF token, not masked.
        assert isinstance(row["key"], str)
        assert len(row["key"]) == 40
        assert all(ch in "0123456789abcdef" for ch in row["key"])
    # All required columns are present in every row.
    for row in body["data"]:
        for key in (
            "user_id", "username", "email",
            "is_staff", "is_active", "has_token", "token_created", "key",
        ):
            assert key in row


@pytest.mark.django_db
def test_tokens_list_only_returns_users_with_tokens(admin_client):
    c, _admin = admin_client
    User.objects.create_user(username="bob")  # no token
    User.objects.create_user(username="carol")  # no token
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    usernames = {row["username"] for row in resp.json()["data"]}
    # Only adm-tk (admin fixture, has token) and alice — bob/carol have no token.
    assert usernames == {"adm-tk", "alice"}


@pytest.mark.django_db
def test_tokens_list_search_matches_username_and_email(admin_client):
    c, _ = admin_client
    alice = User.objects.create_user(username="alice", email="alice@example.com")
    Token.objects.create(user=alice)
    bob = User.objects.create_user(username="bob", email="bob@corp.io")
    Token.objects.create(user=bob)

    resp = c.get("/api/v3/tokens/?search=alice")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "alice" in usernames and "bob" not in usernames

    resp = c.get("/api/v3/tokens/?search=corp.io")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "bob" in usernames and "alice" not in usernames


@pytest.mark.django_db
def test_tokens_list_cursor_pagination(admin_client):
    c, _ = admin_client
    # admin fixture (id=1, has token) plus 4 more users each with a token.
    for name in ("u1", "u2", "u3", "u4"):
        u = User.objects.create_user(username=name)
        Token.objects.create(user=u)

    page1 = c.get("/api/v3/tokens/?limit=2").json()
    assert len(page1["data"]) == 2
    assert page1["next_cursor"] is not None
    assert page1["total"] == 5

    page2 = c.get(f"/api/v3/tokens/?limit=2&cursor={page1['next_cursor']}").json()
    assert len(page2["data"]) == 2
    page1_ids = {row["user_id"] for row in page1["data"]}
    page2_ids = {row["user_id"] for row in page2["data"]}
    assert page1_ids.isdisjoint(page2_ids)


@pytest.mark.django_db
def test_tokens_list_forbids_non_staff():
    user = User.objects.create_user(username="reg", password="x")
    Token.objects.create(user=user)
    c = APIClient()
    c.force_authenticate(user=user)
    assert c.get("/api/v3/tokens/").status_code == 403


@pytest.mark.django_db
def test_tokens_list_forbids_anonymous():
    assert APIClient().get("/api/v3/tokens/").status_code == 401
