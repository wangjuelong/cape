"""Lock-in for audit_log ACTIONS catalog — new entries must explicitly land here."""
from audit_log import ACTIONS


def test_profile_update_action_registered():
    keys = [a[0] for a in ACTIONS]
    assert "profile_update" in keys
    descriptor = next(a for a in ACTIONS if a[0] == "profile_update")
    assert descriptor == ("profile_update", "Profile Update", "auth")
