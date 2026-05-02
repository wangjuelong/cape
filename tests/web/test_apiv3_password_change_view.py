"""Integration tests for /api/v3/me/password/ POST."""
import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient


# Inject Django's stock validators so the weak-password test can fire — the
# dev/test env doesn't configure AUTH_PASSWORD_VALIDATORS globally.
_DEFAULT_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


@pytest.fixture(autouse=True)
def _reset_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def authed_client():
    user = User.objects.create_user(username="pw-test", password="oldOldOLD1!")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
def test_change_succeeds(authed_client):
    client, user = authed_client
    resp = client.post(
        "/api/v3/me/password/",
        {
            "current_password": "oldOldOLD1!",
            "new_password": "NewPassMORE9876!",
            "confirm_password": "NewPassMORE9876!",
        },
        format="json",
    )
    assert resp.status_code == 204
    user.refresh_from_db()
    assert user.check_password("NewPassMORE9876!")


@pytest.mark.django_db
def test_wrong_current_400(authed_client):
    client, user = authed_client
    resp = client.post(
        "/api/v3/me/password/",
        {
            "current_password": "WRONG",
            "new_password": "NewPassMORE9876!",
            "confirm_password": "NewPassMORE9876!",
        },
        format="json",
    )
    assert resp.status_code == 400
    user.refresh_from_db()
    assert user.check_password("oldOldOLD1!")  # unchanged


@pytest.mark.django_db
def test_mismatched_confirm_400(authed_client):
    client, user = authed_client
    resp = client.post(
        "/api/v3/me/password/",
        {
            "current_password": "oldOldOLD1!",
            "new_password": "NewPassMORE9876!",
            "confirm_password": "DifferentMORE9876!",
        },
        format="json",
    )
    assert resp.status_code == 400
    user.refresh_from_db()
    assert user.check_password("oldOldOLD1!")


@override_settings(AUTH_PASSWORD_VALIDATORS=_DEFAULT_VALIDATORS)
@pytest.mark.django_db
def test_weak_password_400(authed_client):
    client, _ = authed_client
    resp = client.post(
        "/api/v3/me/password/",
        {
            "current_password": "oldOldOLD1!",
            "new_password": "abc",
            "confirm_password": "abc",
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_unauthenticated_401():
    resp = APIClient().post(
        "/api/v3/me/password/",
        {
            "current_password": "x",
            "new_password": "y",
            "confirm_password": "y",
        },
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_password_change_emits_audit_log(authed_client):
    from audit_log.models import AuditEvent

    client, user = authed_client
    AuditEvent.objects.filter(action="password_change").delete()
    client.post(
        "/api/v3/me/password/",
        {
            "current_password": "oldOldOLD1!",
            "new_password": "NewPassMORE9876!",
            "confirm_password": "NewPassMORE9876!",
        },
        format="json",
    )
    # password_change is fired by allauth's password_changed signal,
    # which audit_log.signals listens to. The view doesn't call
    # audit.log() explicitly.
    events = AuditEvent.objects.filter(action="password_change")
    assert events.count() >= 1
