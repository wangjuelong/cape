"""Audit log app — single-table user-action audit trail."""

default_app_config = "audit_log.apps.AuditLogConfig"


# ---------------------------------------------------------------------------
# Action catalog. The ONLY place where action values are enumerated.
# Both backend (signals + helpers) and apiv3 actions endpoint pull from here.
# ---------------------------------------------------------------------------

ACTIONS: tuple[tuple[str, str, str], ...] = (
    # (value, label, category)
    ("login_success", "Login Success", "auth"),
    ("login_failed", "Login Failed", "auth"),
    ("logout", "Logout", "auth"),
    ("password_change", "Password Change", "auth"),
    ("profile_update", "Profile Update", "auth"),
    ("password_reset_request", "Password Reset Request", "auth"),
    ("signup", "Sign Up", "auth"),
    ("ban_user", "Ban User", "user_mgmt"),
    ("ban_user_tasks", "Ban User Tasks", "user_mgmt"),
    ("unban_user", "Unban User", "user_mgmt"),
    ("admin_addition", "Admin: Created", "admin"),
    ("admin_change", "Admin: Changed", "admin"),
    ("admin_deletion", "Admin: Deleted", "admin"),
    # User management (SPA admin user CRUD)
    ("user_create", "User Created", "user_mgmt"),
    ("user_update", "User Updated", "user_mgmt"),
    ("user_delete", "User Deleted", "user_mgmt"),
    ("user_activate", "User Activated", "user_mgmt"),
    ("user_deactivate", "User Deactivated", "user_mgmt"),
    ("user_set_password", "Admin Set Password", "user_mgmt"),
    # API tokens
    ("token_create", "API Token Created", "auth"),
    ("token_rotate", "API Token Rotated", "auth"),
    ("token_revoke", "API Token Revoked", "auth"),
)
