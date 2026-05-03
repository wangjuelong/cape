"""Lock-in for /api/v3/users/ list + detail serializer shapes."""
import pytest
from django.contrib.auth.models import Group, User

from apiv3.serializers import UserListSerializer, UserSerializer


@pytest.mark.django_db
def test_list_serializer_shape():
    u = User.objects.create_user(username="alice", email="a@x.com")
    data = UserListSerializer(u).data
    assert set(data.keys()) == {
        "id", "username", "email", "first_name", "last_name",
        "is_staff", "is_superuser", "is_active",
        "last_login", "date_joined",
        "group_count", "has_token", "subscription",
    }
    assert data["username"] == "alice"
    assert data["group_count"] == 0
    assert data["has_token"] is False


@pytest.mark.django_db
def test_detail_serializer_shape():
    u = User.objects.create_user(username="bob", email="b@x.com")
    g = Group.objects.create(name="testgroup")
    u.groups.add(g)
    data = UserSerializer(u).data
    assert "group_ids" in data
    assert data["group_ids"] == [g.id]
    assert "permission_ids" in data
    assert "userprofile" in data
    assert "has_token" in data
