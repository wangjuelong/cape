# Audit Log

Phase 1 user-action audit trail — captures authentication and user-management events for security review.

## What Gets Captured

| Action | Source | Trigger |
|---|---|---|
| `login_success` | allauth `user_logged_in` signal | Successful credential check |
| `login_failed` | Django `user_login_failed` signal | Wrong password / non-existent user |
| `logout` | allauth `user_logged_out` signal | Sign out |
| `password_change` | allauth `password_changed` / `password_set` | `/accounts/password/change/` |
| `password_reset_request` | allauth `password_reset` | `/accounts/password/reset/` |
| `signup` | allauth `user_signed_up` | New account |
| `ban_user` | explicit `audit.log()` in `analysis/views.py` | `/analysis/ban_user/<id>/` |
| `ban_user_tasks` | explicit `audit.log()` | `/analysis/ban_user_tasks/<id>/` |
| `unban_user` | (no view yet — captured via admin LogEntry bridge) | `/admin/auth/user/<id>/change/` toggling is_active |
| `admin_addition` / `admin_change` / `admin_deletion` | LogEntry post_save bridge | Any Django admin action |

## Storage

- Table: `audit_events` in **`siteauth.sqlite`** (Django default DB)
- Schema: see `web/audit_log/models.py`
- Append-only by application convention (no DB triggers)
- Retention: **90 days**, pruned by `utils/audit_prune.py` via systemd timer `cape-audit-prune.timer`
- The only allowed write path is `audit_log.helpers.log()`. The only allowed delete path is the prune script.

## API

`GET /api/v3/audits/` — paginated list, IsAdminUser only. See `docs/web/api-reference.md` § Audit Log.

`GET /api/v3/audits/actions/` — enum catalog for the SPA filter dropdown.

## SPA

`/audit` route — accessible from the Admin section of the sidebar. Non-staff users see an `Admin privileges required` alert. Staff users see the filterable table.

## Security Notes

- Audit data is sensitive (IP / username / forensic context). DRF `IsAdminUser` permission gates the API; the SPA also checks `useCurrentUser().is_staff` and short-circuits at the route level.
- Metadata keys whose names match `password|token|secret|cookie|authorization` (case-insensitive substring) get their values redacted to `[REDACTED]` before insert.
- Failed audit writes are swallowed and logged to the cape-web journal — never propagate up to break business requests.

## Deployment

```bash
# 1. New migration on existing deployment
sudo -u cape /opt/CAPEv2/.venv/bin/python /opt/CAPEv2/web/manage.py migrate audit_log

# 2. Restart cape-web so signal receivers register
sudo systemctl restart cape-web

# 3. Install + enable the prune timer
sudo cp /opt/CAPEv2/systemd/cape-audit-prune.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cape-audit-prune.timer
sudo systemctl list-timers | grep cape-audit-prune
```

## Phase 2 — Future

- Task lifecycle events (delete / reschedule / reprocess) — wait until task functionality stabilises
- `conf/*.conf` file-level audit — separate spec when need arises
