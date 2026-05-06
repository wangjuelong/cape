import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="admincre", password="x", is_staff=True, is_superuser=True)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_create_basic(admin_client):
    c, _ = admin_client
    resp = c.post(
        "/api/v3/users/",
        {"username": "alice2", "password": "InitialPass987Strong!", "email": "a@x.com"},
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["username"] == "alice2"
    u = User.objects.get(username="alice2")
    assert u.check_password("InitialPass987Strong!")


@pytest.mark.django_db
def test_create_audit_emitted(admin_client):
    c, admin = admin_client
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_create").delete()
    c.post(
        "/api/v3/users/",
        {"username": "bob2", "password": "InitialPass987Strong!"},
        format="json",
    )
    events = AuditEvent.objects.filter(action="user_create")
    assert events.count() == 1
    e = events.first()
    assert e.actor_username == admin.username


@pytest.mark.django_db
def test_create_duplicate_username(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="dup")
    resp = c.post(
        "/api/v3/users/",
        {"username": "dup", "password": "InitialPass987Strong!"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_weak_password(admin_client):
    from django.test.utils import override_settings
    c, _ = admin_client
    with override_settings(AUTH_PASSWORD_VALIDATORS=[
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
         "OPTIONS": {"min_length": 8}}
    ]):
        resp = c.post(
            "/api/v3/users/",
            {"username": "weakpw", "password": "abc"},
            format="json",
        )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_superuser_auto_syncs_is_staff(admin_client):
    """Creating a user as superuser auto-syncs is_staff (sub-spec #8)."""
    c, _ = admin_client
    resp = c.post(
        "/api/v3/users/",
        {"username": "newsuper", "password": "InitialPass987Strong!", "is_superuser": True},
        format="json",
    )
    assert resp.status_code == 201
    u = User.objects.get(username="newsuper")
    assert u.is_superuser is True
    assert u.is_staff is True  # auto-synced


@pytest.mark.django_db
def test_create_rejects_non_staff():
    c = APIClient()
    c.force_authenticate(user=User.objects.create_user(username="reg"))
    assert c.post("/api/v3/users/", {"username": "x", "password": "x"}, format="json").status_code == 403
