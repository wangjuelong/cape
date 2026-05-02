"""MeUpdateSerializer field validation."""
from apiv3.serializers import MeUpdateSerializer


def test_accepts_partial_update():
    s = MeUpdateSerializer(data={"first_name": "Alice"})
    assert s.is_valid(), s.errors
    assert s.validated_data == {"first_name": "Alice"}


def test_accepts_empty_string_to_clear_name():
    s = MeUpdateSerializer(data={"first_name": ""})
    assert s.is_valid(), s.errors


def test_rejects_unknown_field():
    s = MeUpdateSerializer(data={"username": "newname"})
    assert not s.is_valid()
    assert "username" in s.errors


def test_rejects_is_staff():
    s = MeUpdateSerializer(data={"is_staff": True})
    assert not s.is_valid()
    assert "is_staff" in s.errors


def test_rejects_password():
    s = MeUpdateSerializer(data={"password": "x"})
    assert not s.is_valid()
    assert "password" in s.errors


def test_rejects_invalid_email():
    s = MeUpdateSerializer(data={"email": "not-an-email"})
    assert not s.is_valid()
    assert "email" in s.errors


def test_max_lengths():
    s = MeUpdateSerializer(data={"first_name": "x" * 151})
    assert not s.is_valid()
    assert "first_name" in s.errors
