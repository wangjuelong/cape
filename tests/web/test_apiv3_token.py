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
    a = User.objects.create_user(username="adm-tok", password="x", is_staff=True, is_superuser=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.fixture
def regular_client():
    u = User.objects.create_user(username="reg-tok", password="x")
    c = APIClient()
    c.force_authenticate(user=u)
    return c, u


@pytest.mark.django_db
def test_me_token_get_empty(regular_client):
    c, _ = regular_client
    resp = c.get("/api/v3/me/token/")
    assert resp.status_code == 200
    assert resp.json()["key"] is None


@pytest.mark.django_db
def test_me_token_post_creates(regular_client):
    c, u = regular_client
    resp = c.post("/api/v3/me/token/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["key"]
    assert Token.objects.filter(user=u).exists()


@pytest.mark.django_db
def test_me_token_post_rotates(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    old = Token.objects.get(user=u).key
    resp = c.post("/api/v3/me/token/")
    new = resp.json()["key"]
    assert new != old
    # Only one token left after rotate.
    assert Token.objects.filter(user=u).count() == 1


@pytest.mark.django_db
def test_me_token_delete(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    resp = c.delete("/api/v3/me/token/")
    assert resp.status_code == 204
    assert not Token.objects.filter(user=u).exists()


@pytest.mark.django_db
def test_admin_token_get(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="t1")
    Token.objects.create(user=target)
    resp = c.get(f"/api/v3/users/{target.id}/token/")
    assert resp.status_code == 200
    assert resp.json()["key"]


@pytest.mark.django_db
def test_admin_token_post_rotates(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="t2")
    Token.objects.create(user=target)
    resp = c.post(f"/api/v3/users/{target.id}/token/")
    assert resp.status_code == 200
    assert resp.json()["key"] != ""


@pytest.mark.django_db
def test_admin_token_get_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient()
    c.force_authenticate(user=user)
    target = User.objects.create_user(username="other")
    assert c.get(f"/api/v3/users/{target.id}/token/").status_code == 403


@pytest.mark.django_db
def test_token_audit_create(regular_client):
    c, _ = regular_client
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action__in=("token_create", "token_rotate")).delete()
    c.post("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_create").count() == 1


@pytest.mark.django_db
def test_token_audit_rotate(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="token_rotate").delete()
    c.post("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_rotate").count() == 1


@pytest.mark.django_db
def test_token_audit_revoke(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="token_revoke").delete()
    c.delete("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_revoke").count() == 1
