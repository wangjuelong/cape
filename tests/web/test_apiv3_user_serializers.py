"""Lock-in for /api/v3/users/ list + detail serializer shapes."""
import pytest
from django.contrib.auth.models import User

from apiv3.serializers import UserListSerializer, UserSerializer, UserUpdateSerializer


@pytest.mark.django_db
def test_list_serializer_shape():
    u = User.objects.create_user(username="alice", email="a@x.com")
    data = UserListSerializer(u).data
    assert set(data.keys()) == {
        "id", "username", "email", "first_name", "last_name",
        "is_staff", "is_superuser", "is_active",
        "last_login", "date_joined",
        "has_token",
    }
    assert data["username"] == "alice"
    assert data["has_token"] is False


@pytest.mark.django_db
def test_detail_serializer_shape():
    u = User.objects.create_user(username="bob", email="b@x.com")
    data = UserSerializer(u).data
    assert set(data.keys()) == {
        "id", "username", "email", "first_name", "last_name",
        "is_staff", "is_superuser", "is_active",
        "last_login", "date_joined",
        "has_token",
    }
    # Forbidden fields after sub-spec #8 RBAC collapse:
    for forbidden in (
        "groups", "user_permissions",
        "permission_count", "permission_ids", "group_count", "group_ids",
        "subscription", "reports_dl_allowed", "userprofile",
    ):
        assert forbidden not in data, f"{forbidden} should not be in detail response"


@pytest.mark.django_db
def test_user_update_serializer_rejects_is_staff():
    """is_staff is no longer admin-editable; must be in the unknown-fields list."""
    s = UserUpdateSerializer(data={"is_staff": True})
    assert not s.is_valid()
    assert "is_staff" in s.errors
