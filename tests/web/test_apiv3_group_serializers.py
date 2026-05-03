"""GroupListSerializer + GroupDetailSerializer field shape."""
import pytest
from django.contrib.auth.models import Group, Permission, User

from apiv3.serializers import (
    GroupDetailSerializer,
    GroupListSerializer,
)


@pytest.mark.django_db
def test_group_list_serializer_shape():
    g = Group.objects.create(name="moderators")
    p = Permission.objects.first()
    g.permissions.add(p)
    u = User.objects.create_user(username="alice")
    g.user_set.add(u)
    data = GroupListSerializer(g).data
    assert set(data.keys()) == {"id", "name", "permission_count", "member_count"}
    assert data["name"] == "moderators"
    assert data["permission_count"] == 1
    assert data["member_count"] == 1


@pytest.mark.django_db
def test_group_detail_serializer_shape():
    g = Group.objects.create(name="readers")
    p1 = Permission.objects.first()
    p2 = Permission.objects.last()
    g.permissions.add(p1, p2)
    data = GroupDetailSerializer(g).data
    assert set(data.keys()) == {"id", "name", "permission_ids", "member_count"}
    assert sorted(data["permission_ids"]) == sorted([p1.id, p2.id])
    assert data["member_count"] == 0
