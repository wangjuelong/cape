"""Integration: hitting /analysis/ban_user/<id>/ writes an audit row."""

import pytest
from django.contrib.auth import get_user_model
from django.test import Client


@pytest.fixture
def admin_user(db):
    User = get_user_model()
    return User.objects.create_superuser(
        username="admin", email="a@x", password="adminpw1234", is_staff=True
    )


@pytest.fixture
def victim_user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="bob", email="b@x", password="bobpw1234"
    )


@pytest.mark.django_db
def test_ban_user_writes_audit_row(admin_user, victim_user):
    from audit_log.models import AuditEvent

    client = Client()
    client.login(username="admin", password="adminpw1234")
    AuditEvent.objects.all().delete()  # discard the login_success row

    response = client.get(f"/analysis/ban_user/{victim_user.id}/")
    # ban_user redirects to HTTP_REFERER on success — accept 200/302
    assert response.status_code in (200, 302)

    rows = list(AuditEvent.objects.filter(action="ban_user"))
    assert len(rows) == 1
    assert rows[0].actor_user_id == admin_user.id
    assert rows[0].target_type == "user"
    assert rows[0].target_id == str(victim_user.id)
    assert rows[0].target_label == f"user:{victim_user.username}"


@pytest.mark.django_db
def test_ban_all_user_tasks_writes_audit_row(admin_user, victim_user):
    from audit_log.models import AuditEvent

    client = Client()
    client.login(username="admin", password="adminpw1234")
    AuditEvent.objects.all().delete()

    response = client.get(f"/analysis/ban_user_tasks/{victim_user.id}/")
    assert response.status_code in (200, 302)

    rows = list(AuditEvent.objects.filter(action="ban_user_tasks"))
    assert len(rows) == 1
    assert rows[0].actor_user_id == admin_user.id
    assert rows[0].target_type == "user"
    assert rows[0].target_id == str(victim_user.id)
    assert rows[0].target_label == f"user:{victim_user.username}"
