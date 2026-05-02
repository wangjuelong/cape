"""ChangePasswordSerializer validation."""
from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User
from django.test import override_settings

from apiv3.serializers import ChangePasswordSerializer

# The dev/test environment does not configure AUTH_PASSWORD_VALIDATORS in
# settings.py; without this override, validate_password() is a no-op and the
# weak-password assertion below cannot trip. This decorator scopes the
# defaults to the single test that needs them — production behaviour is
# unchanged.
_DEFAULT_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


@pytest.mark.django_db
def test_accepts_valid_change():
    user = User.objects.create_user(username="testuser", password="oldOldOLD123!")
    s = ChangePasswordSerializer(
        data={
            "current_password": "oldOldOLD123!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!",
        },
        context={"user": user},
    )
    assert s.is_valid(), s.errors


@pytest.mark.django_db
def test_rejects_wrong_current():
    user = User.objects.create_user(username="testuser2", password="rightPass1!")
    s = ChangePasswordSerializer(
        data={
            "current_password": "wrongPass!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!",
        },
        context={"user": user},
    )
    assert not s.is_valid()
    assert "current_password" in s.errors


@pytest.mark.django_db
def test_rejects_mismatched_confirm():
    user = User.objects.create_user(username="testuser3", password="rightPass1!")
    s = ChangePasswordSerializer(
        data={
            "current_password": "rightPass1!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "DifferentPass123!",
        },
        context={"user": user},
    )
    assert not s.is_valid()
    assert "confirm_password" in s.errors


@override_settings(AUTH_PASSWORD_VALIDATORS=_DEFAULT_VALIDATORS)
@pytest.mark.django_db
def test_rejects_weak_password():
    user = User.objects.create_user(username="testuser4", password="rightPass1!")
    s = ChangePasswordSerializer(
        data={
            "current_password": "rightPass1!",
            "new_password": "abc",
            "confirm_password": "abc",
        },
        context={"user": user},
    )
    assert not s.is_valid()
    assert "new_password" in s.errors


@pytest.mark.django_db
def test_rejects_missing_field():
    user = User.objects.create_user(username="testuser5", password="rightPass1!")
    s = ChangePasswordSerializer(
        data={
            "current_password": "rightPass1!",
            "new_password": "NewStrongPass123!",
        },
        context={"user": user},
    )
    assert not s.is_valid()
    assert "confirm_password" in s.errors
