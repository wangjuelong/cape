"""Audit log ACTIONS catalog must include group_create / group_update / group_delete."""
from audit_log import ACTIONS


EXPECTED = {
    ("group_create", "Group Created", "user_mgmt"),
    ("group_update", "Group Updated", "user_mgmt"),
    ("group_delete", "Group Deleted", "user_mgmt"),
}


def test_group_actions_registered():
    actions = set(ACTIONS)
    missing = EXPECTED - actions
    assert not missing, f"missing actions: {missing}"
