"""Lock-in for the 9 new user-mgmt + token audit ACTIONS."""
from audit_log import ACTIONS

EXPECTED = {
    ("user_create",       "User Created",       "user_mgmt"),
    ("user_update",       "User Updated",       "user_mgmt"),
    ("user_delete",       "User Deleted",       "user_mgmt"),
    ("user_activate",     "User Activated",     "user_mgmt"),
    ("user_deactivate",   "User Deactivated",   "user_mgmt"),
    ("user_set_password", "Admin Set Password", "user_mgmt"),
    ("token_create",      "API Token Created",  "auth"),
    ("token_rotate",      "API Token Rotated",  "auth"),
    ("token_revoke",      "API Token Revoked",  "auth"),
}


def test_user_mgmt_actions_registered():
    actions = set(ACTIONS)
    missing = EXPECTED - actions
    assert not missing, f"missing actions: {missing}"
