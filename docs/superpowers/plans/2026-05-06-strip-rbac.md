# Strip RBAC Implementation Plan (sub-spec #8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse CAPE's authorization to a binary `is_superuser` model, deleting the entire group/permission management surface (SPA + apiv3 + audit ACTIONs + tests) and the `UserProfile` model (replaced by global config), folding `/users/<id>` into a single page, and partially reverting sub-spec #7 so admins can still Generate tokens from the `/tokens` page.

**Architecture:** Five logically-distinct layers wrapped in 5 sequential tasks: (T1) backend authority swap + delete groups/permissions endpoints, (T2) delete UserProfile + migration + global-config fallbacks, (T3) `/tokens` backend revert, (T4) frontend deletes (groups SPA + sidebar + components) + `/users/<id>` single-page rewrite, (T5) `/tokens` frontend revert + e2e adjustments + push.

**Tech Stack:** Django 5 / DRF / drf-spectacular (host); React 18 / Vite / TanStack Query v5 / Playwright (web); pytest (host tests).

**Spec:** `docs/superpowers/specs/2026-05-06-strip-rbac-design.md` (commit `b8b70331`)

**Branch:** `refactor/web-spa` (HEAD before this plan: `b8b70331`)

**Live test box:** `192.168.2.240` (cape/cape, admin/admin) — see memory `test_box_240.md`. cape-web listens `0.0.0.0:8000`.

---

## File Structure

| Layer | File | Action |
|---|---|---|
| Permissions | `web/apiv3/permissions.py` | Add `IsSuperUser`; switch `IsTaskTlpAllowed` + `CanDownloadReports` from `is_staff` → `is_superuser`; drop `UserProfile` fallback in `CanDownloadReports` |
| Authority | `web/apiv3/views.py` | 16× `IsAdminUser` → `IsSuperUser`; in users_list POST + users_detail PATCH, auto-sync `is_staff = is_superuser` on write |
| Authority | `web/apiv3/serializers.py` | Drop `is_staff` field from `UserCreateSerializer` + `UserUpdateSerializer` (incl. allowed sets); keep on read serializers |
| Groups delete | `web/apiv3/views.py` | Delete: `groups_list`, `groups_detail`, `groups_bulk_delete`, `groups_members`, `permissions_list`, `users_set_groups`, `users_set_permissions` |
| Groups delete | `web/apiv3/urls.py` | Delete 7 path entries |
| Groups delete | `web/apiv3/serializers.py` | Delete `GroupListSerializer`, `GroupDetailSerializer`, `GroupCreateSerializer`, `GroupUpdateSerializer`, `PermissionSerializer`, the `GroupSerializer = GroupListSerializer` alias; drop `groups`, `user_permissions`, `permission_count`, `permission_ids`, `group_count`, `group_ids` from `UserSerializer` |
| Audit | `web/audit_log/__init__.py` | Delete 3 ACTION rows: `group_create`, `group_update`, `group_delete` |
| Tests | `tests/web/test_apiv3_groups_*.py` (8 files) | Delete |
| UserProfile | `web/users/models.py` | Delete `UserProfile` class + signal handler |
| UserProfile | `web/users/migrations/0004_drop_userprofile.py` | Create — `DeleteModel("UserProfile")` |
| UserProfile | `web/apiv3/serializers.py` | Delete `UserProfileNestedSerializer`; drop `userprofile` nested + `subscription` + `reports_dl_allowed` from User serializers |
| UserProfile | `web/apiv3/views.py` | `me` view drop subscription/reports_dl_allowed; `users_detail` PATCH drop `profile_data` handling; drop `select_related("userprofile")` |
| UserProfile | `web/apiv2/throttling.py` | Use `api_cfg.api.default_subscription_ratelimit` global instead of per-user |
| UserProfile | `web/analysis/views.py` | Drop `userprofile.reports` check (line 391) |
| UserProfile | `web/apiv2/views.py` | Drop `userprofile.reports` check (line 1105) |
| Tokens BE | `web/apiv3/views.py` `tokens_list` | Drop `.filter(auth_token__isnull=False)`; restore "all users returned" semantics |
| Tokens BE | `tests/web/test_apiv3_tokens_list.py` | Adjust: replace "only returns users with tokens" test with "returns all users; key is null when no token" |
| FE delete | `frontend/app/src/routes/groups.tsx` (3 files) | Delete |
| FE delete | `frontend/app/src/components/groups/` (entire dir) | Delete |
| FE delete | `frontend/app/src/components/users/PermissionsPicker.tsx` | Delete |
| FE delete | `frontend/app/src/components/users/GroupsPicker.tsx` | Delete |
| FE delete | `frontend/app/src/components/users/HistoryTab.tsx` | Delete |
| FE delete | `frontend/app/src/components/users/TokenSection.tsx` | Delete |
| FE delete | `frontend/app/src/hooks/useGroups.ts` | Delete |
| FE delete | `frontend/app/src/lib/api/groups.ts` | Delete |
| FE delete | `frontend/app/tests/e2e/groups-management.spec.mjs` | Delete |
| FE modify | `frontend/app/src/router.tsx` | Drop 3 `/groups*` route entries + lazy imports |
| FE modify | `frontend/app/src/components/shell/Sidebar.tsx` | Drop Groups NavItem |
| FE modify | `frontend/app/src/lib/api/users.ts` | Drop `setUserGroups`, `setUserPermissions` |
| FE modify | `frontend/app/src/lib/query-keys.ts` | Drop `groups: {…}` block |
| FE modify | `frontend/app/src/routes/users-detail.tsx` | Single-page rewrite: drop TABS / tab UI / 5 sub-tab branches; inline Basic content; drop `is_staff` toggle |
| FE modify | `frontend/app/src/routes/users-new.tsx` | Drop `is_staff` checkbox |
| FE modify | `frontend/app/src/components/tokens/TokenListTable.tsx` | When `row.key === null`, render dim `⊘ None` + `[Generate]` button (in addition to existing has-token rendering) |
| FE modify | `frontend/app/src/routes/tokens.tsx` | Re-add `onGenerate(row)` callback (confirm + rotateUserToken + RevealDialog) |
| E2E modify | `frontend/app/tests/e2e/users-management.spec.mjs` | Drop tab navigation; admin token verified at `/tokens` |
| E2E modify | `frontend/app/tests/e2e/tokens-management.spec.mjs` | Test 4: revoke leaves row visible with `[Generate]` (not `toBeHidden`) |

---

## Task T1: Backend authority collapse + delete groups/permissions endpoints

**Files:**
- Modify: `web/apiv3/permissions.py` (add IsSuperUser, switch existing classes)
- Modify: `web/apiv3/views.py` (16 perm swaps + delete 7 views + auto-sync is_staff)
- Modify: `web/apiv3/urls.py` (delete 7 path entries)
- Modify: `web/apiv3/serializers.py` (delete 4 group serializers + PermissionSerializer + drop fields)
- Modify: `web/audit_log/__init__.py` (delete 3 ACTIONs)
- Delete: `tests/web/test_apiv3_groups_list_extended.py`, `..._detail.py`, `..._create.py`, `..._update.py`, `..._delete.py`, `..._members.py`, `..._permissions.py`, `..._group_serializers.py`

- [ ] **Step 1: Add `IsSuperUser` and switch existing perm classes in `web/apiv3/permissions.py`**

In `web/apiv3/permissions.py`:

a) Append a new class after `CanDownloadReports`:

```python
class IsSuperUser(permissions.BasePermission):
    """Single-flag admin gate after sub-spec #8 collapsed RBAC.

    Replaces all uses of DRF's built-in IsAdminUser (which checks
    is_staff). is_staff stays bound to is_superuser for Django admin
    compatibility but no longer carries independent meaning.
    """

    message = "Superuser privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )
```

b) In `IsTaskTlpAllowed.has_object_permission` (around line 60): replace `if request.user.is_staff:` with `if request.user.is_superuser:`.

c) Replace the entire `CanDownloadReports` class body (around lines 66-82) with:

```python
class CanDownloadReports(permissions.BasePermission):
    """Gate heavy artefact downloads to superusers or globally per ALLOW_DL_REPORTS_TO_ALL."""

    message = "User is not allowed to download reports"

    def has_permission(self, request, view) -> bool:
        if request.user.is_superuser:
            return True
        from django.conf import settings as dj_settings
        return bool(getattr(dj_settings, "ALLOW_DL_REPORTS_TO_ALL", False))
```

The UserProfile fallback was the only consumer of that model's `reports` field outside `web/apiv2`; deleting it here keeps Task T2 (UserProfile drop) safe.

- [ ] **Step 2: Replace 16× `IsAdminUser` → `IsSuperUser` in `web/apiv3/views.py`**

a) Find the import line that pulls `IsAdminUser` from `rest_framework.permissions`. Replace with `IsAuthenticated` only (drop `IsAdminUser` import).

b) Add at the top: `from apiv3.permissions import IsSuperUser` (next to existing apiv3.permissions imports if any).

c) Replace EVERY occurrence of `@permission_classes([IsAdminUser])` with `@permission_classes([IsSuperUser])` in `web/apiv3/views.py`. There are 16 occurrences (lines 371, 463, 548, 606, 613, 623, 739, 801, 880, 960, 1015, 1083, 1124, 1173, 1217, plus tokens_list).

Verify with: `grep -n "IsAdminUser" web/apiv3/views.py` — must return zero matches after this step.

- [ ] **Step 3: Delete 7 group/permission views from `web/apiv3/views.py`**

Delete these complete function definitions (with their `@extend_schema` + `@api_view` + `@permission_classes` decorators) from `web/apiv3/views.py`:

1. `groups_list` (around line 720-805)
2. `groups_detail` (around line 807-880)
3. `groups_bulk_delete` (around line 880-940)
4. `groups_members` (around line 940-1010)
5. `permissions_list` (around line 1010-1080)
6. `users_set_groups` (around line 1080-1120)
7. `users_set_permissions` (around line 1120-1175)

Find each by `grep -n "^def groups_\|^def permissions_\|^def users_set_" web/apiv3/views.py`. Delete from the `# ---` section comment ABOVE the function down to (but not including) the next `# ---` section comment.

After deletion, verify the surrounding section comments still make sense (e.g., `# Groups + Permissions list + per-user m2m PATCH` block header should also be deleted since its content is gone).

- [ ] **Step 4: Auto-sync `is_staff = is_superuser` on user write**

Find `users_list` view's POST branch (around line 380-400). Change the `is_staff` setting to derive from `is_superuser`:

```python
# Before
user.is_staff = validated.get("is_staff", False)
user.is_superuser = validated.get("is_superuser", False)

# After (auto-sync)
user.is_superuser = validated.get("is_superuser", False)
user.is_staff = user.is_superuser  # auto-sync; sub-spec #8 dropped is_staff toggle
```

Find `users_detail` PATCH branch (around line 419). The loop iterates `for fld in ("is_staff", "is_superuser", "is_active"):` — drop `"is_staff"` from the tuple, then add a follow-up sync:

```python
# Replace the existing tuple-iteration block with:
for fld in ("is_superuser", "is_active"):
    if fld in validated:
        if getattr(user, fld) != validated[fld]:
            setattr(user, fld, validated[fld])
            changed.append(fld)
# Auto-sync is_staff to is_superuser whenever the latter changes.
if "is_superuser" in changed:
    if user.is_staff != user.is_superuser:
        user.is_staff = user.is_superuser
        changed.append("is_staff")
```

- [ ] **Step 5: Delete 7 path entries from `web/apiv3/urls.py`**

Delete these lines:

```python
path("users/<int:user_id>/groups/", views.users_set_groups, name="users-set-groups"),
path("users/<int:user_id>/permissions/", views.users_set_permissions, name="users-set-permissions"),
path("groups/", views.groups_list, name="groups-list"),
path("groups/bulk-delete/", views.groups_bulk_delete, name="groups-bulk-delete"),
path("groups/<int:group_id>/", views.groups_detail, name="groups-detail"),
path("groups/<int:group_id>/members/", views.groups_members, name="groups-members"),
path("permissions/", views.permissions_list, name="permissions-list"),
```

The `# Groups + Permissions` section comment should also be deleted.

- [ ] **Step 6: Delete group + permission serializers + drop m2m fields from `UserSerializer`**

a) Delete entire classes from `web/apiv3/serializers.py`:
- `GroupListSerializer` (around line 274)
- `GroupDetailSerializer` (around line 299)
- `GroupCreateSerializer` (around line 314)
- `GroupUpdateSerializer` (around line 329)
- `GroupSerializer = GroupListSerializer` alias line (around line 363)
- `PermissionSerializer` (around line 371)
- The `# ---- Groups + Permissions` section header comment

b) From `UserSerializer` (around line 100-130 area): delete fields `groups`, `user_permissions`, `permission_count`, `permission_ids`, `group_count`, `group_ids` and any associated `SerializerMethodField` definitions (`get_groups`, `get_permission_count`, etc). Drop them from the `Meta.fields` list / `class Meta` declaration.

c) From `UserUpdateSerializer.to_internal_value` allowed set (around line 225): drop `"is_staff"`. The class field `is_staff = serializers.BooleanField(required=False)` (around line 217) — delete the line.

d) From `UserCreateSerializer.to_internal_value` allowed set (if it has one) and the field declaration (around line 182): drop `is_staff`. The validation that disallows non-superuser from setting is_superuser stays.

e) Delete `from apiv3.serializers import` references to the removed names anywhere in views.py (search for each name and prune).

- [ ] **Step 7: Delete 3 audit ACTIONs**

In `web/audit_log/__init__.py`, find the `ACTIONS` tuple/list. Delete these 3 rows:

```python
("group_create", "Group Created", "user_mgmt"),
("group_update", "Group Updated", "user_mgmt"),
("group_delete", "Group Deleted", "user_mgmt"),
```

(The exact format may differ slightly — match by `group_create` / `group_update` / `group_delete` strings.)

- [ ] **Step 8: Delete 8 group/permission test files**

```bash
cd /Users/lamba/github/cape
git rm tests/web/test_apiv3_groups_list_extended.py
git rm tests/web/test_apiv3_groups_detail.py
git rm tests/web/test_apiv3_groups_create.py
git rm tests/web/test_apiv3_groups_update.py
git rm tests/web/test_apiv3_groups_delete.py
git rm tests/web/test_apiv3_groups_members.py
git rm tests/web/test_apiv3_groups_permissions.py
git rm tests/web/test_apiv3_group_serializers.py
```

- [ ] **Step 9: Adjust user serializer/views tests**

The following files reference removed fields and need targeted adjustments:

- `tests/web/test_apiv3_user_serializers.py` — drop tests asserting `is_staff` field validation in `UserCreateSerializer` / `UserUpdateSerializer`; drop tests asserting `groups`, `user_permissions`, `permission_count`, etc., on `UserSerializer`; add new test:
  ```python
  @pytest.mark.django_db
  def test_user_update_serializer_rejects_is_staff():
      """is_staff is no longer admin-editable; must be in the unknown-fields list."""
      from apiv3.serializers import UserUpdateSerializer
      s = UserUpdateSerializer(data={"is_staff": True})
      assert not s.is_valid()
      assert "is_staff" in s.errors
  ```
- `tests/web/test_apiv3_users_*.py` — for each of `users_list`, `users_create`, `users_update`, `users_detail`, `users_simple_mutations`, `users_bulk`: search for `is_staff`, `groups`, `user_permissions`, `permission_count`, `permission_ids`, `group_count`, `group_ids`, `subscription`, `reports_dl_allowed`, `userprofile`. Drop assertions on these. Where a test specifically targeted `is_staff=True` write semantics, replace with `is_superuser=True` (and assert `is_staff` follows automatically).
- `tests/web/test_apiv3_me_view.py` — drop assertions on `subscription` / `reports_dl_allowed` keys in the `/me/` response (these are removed in Task T2).

For the user-detail serialization test, add:
```python
@pytest.mark.django_db
def test_user_detail_response_omits_groups_permissions_userprofile(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice")
    resp = c.get(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 200
    body = resp.json()
    for forbidden in ("groups", "user_permissions", "permission_count", "permission_ids", "group_count", "group_ids", "subscription", "reports_dl_allowed", "userprofile"):
        assert forbidden not in body, f"{forbidden} should not be in response"
```

- [ ] **Step 10: Run tests on remote canonical box (240)**

Stage the changed/deleted files to 240 + run pytest:

```bash
cd /Users/lamba/github/cape
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  web/apiv3/ web/audit_log/ tests/web/ \
  cape@192.168.2.240:/opt/CAPEv2/staged-T1/

sshpass -p cape ssh cape@192.168.2.240 'cp -r /opt/CAPEv2/staged-T1/* /opt/CAPEv2/'
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_*.py -q 2>&1 | tail -10'
```

Expected: groups tests are gone; users tests pass; no IsAdminUser references; no group_create audit ACTION.

If any test fails, stop and debug; do NOT commit until green.

- [ ] **Step 11: Restart cape-web on 240 + smoke**

```bash
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web && sleep 3 && curl -s -o /dev/null -w "/api/v3/groups/ → %{http_code}\n" http://127.0.0.1:8000/api/v3/groups/'
```

Expected: `/api/v3/groups/ → 404` (route deleted).

- [ ] **Step 12: Commit**

```bash
git add web/apiv3/permissions.py web/apiv3/views.py web/apiv3/urls.py web/apiv3/serializers.py web/audit_log/__init__.py tests/web/
git commit -m "feat(apiv3): collapse RBAC — IsSuperUser + delete groups/permissions endpoints"
```

---

## Task T2: Delete UserProfile + migration + global-config rewire

**Files:**
- Modify: `web/users/models.py` (delete UserProfile class + signal)
- Create: `web/users/migrations/0004_drop_userprofile.py`
- Modify: `web/apiv3/serializers.py` (delete UserProfileNestedSerializer + drop fields)
- Modify: `web/apiv3/views.py` (drop subscription/reports_dl_allowed from me + drop profile_data handling in users_detail)
- Modify: `web/apiv2/throttling.py` (use global config)
- Modify: `web/analysis/views.py:391`, `web/apiv2/views.py:1105` (drop userprofile.reports check)
- Modify: `tests/web/test_apiv3_me_view.py` (drop subscription/reports_dl_allowed assertions)

- [ ] **Step 1: Create migration `web/users/migrations/0004_drop_userprofile.py`**

Latest existing migration is `0003_rename_field_subscription`. New migration depends on it.

Write the new migration:

```python
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_rename_field_subscription"),
    ]
    operations = [
        migrations.DeleteModel(name="UserProfile"),
    ]
```

- [ ] **Step 2: Replace `web/users/models.py` contents**

Replace the entire file with:

```python
"""Empty app — UserProfile removed in sub-spec #8 (RBAC collapse).

The previous per-user subscription / reports flags are now governed by:
- api.conf [api] default_subscription_ratelimit (apiv2 throttling fallback)
- web.conf [general] reports_dl_allowed_to_all (global report-download)
"""
```

(The signal + model class are gone; the migration in Step 1 drops the table.)

- [ ] **Step 3: Update `web/apiv2/throttling.py`**

Replace the file's `subscription` block (around lines 30-40):

```python
# Before — per-user
def get_rate(self):
    if request := self.context.get("request"):
        if request.user.userprofile.subscription:
            requests, duration = self.parse_rate(request.user.userprofile.subscription)
            ...

# After — global from api.conf
def get_rate(self):
    request = getattr(self, "request_instance", None)
    if not request:
        return self.rate
    from lib.cuckoo.common.web_utils import apiconf as api_cfg
    default = getattr(api_cfg.api, "default_subscription_ratelimit", None)
    if default:
        try:
            self.parse_rate(default)
            return default
        except Exception:
            pass
    return self.rate
```

The exact existing structure varies — read the current file before editing, identify the per-user `userprofile.subscription` access, replace with global config lookup. Keep the class signature and method names as-is (DRF's Throttle interface).

- [ ] **Step 4: Drop `userprofile.reports` checks**

`web/analysis/views.py` line 391: find `not request.user.userprofile.reports` and remove the entire condition (the surrounding `if` clause that gates report download). The remaining global `web_cfg.general.reports_dl_allowed_to_all` is the sole gate now.

`web/apiv2/views.py` line 1105: same — find `request.user.userprofile.reports` and remove the per-user condition. If the surrounding `if` becomes redundant, simplify to a constant or delete the branch.

For each file: AFTER editing, run `grep -n "userprofile" <file>` — should return zero matches in non-test code.

- [ ] **Step 5: Drop UserProfile references from `web/apiv3/views.py`**

a) `me` view (around line 173-181): delete `profile = getattr(user, "userprofile", None)` and the `subscription` + `reports_dl_allowed` keys from the response dict.

The post-change `me` response dict fields (preserve everything else):
```python
return Response({
    "username": user.username,
    "email": user.email,
    "is_staff": user.is_staff,
    "is_superuser": user.is_superuser,
    "first_name": user.first_name,
    "last_name": user.last_name,
})
```

b) `users_list` GET (around line 408): change `User.objects.all().select_related("userprofile").prefetch_related("groups")` to `User.objects.all().prefetch_related("groups")`. Then drop `prefetch_related("groups")` too — fully `User.objects.all()`.

c) `users_detail` (around line 469-495):
- Drop `select_related("userprofile")` from the queryset
- Drop `prefetch_related("groups", "user_permissions")` (groups + permissions both gone)
- In PATCH: delete the `profile_data = validated.pop("userprofile", None)` block + the `prof = user.userprofile ...` write loop.

After edit: `grep -n "userprofile" web/apiv3/views.py` → zero non-test matches.

- [ ] **Step 6: Drop UserProfile from `web/apiv3/serializers.py`**

a) Delete `UserProfileNestedSerializer` class (around line 129).

b) `UserSerializer` (around line 100-130):
- Drop `subscription = SerializerMethodField()` and its `get_subscription` method
- Drop `reports_dl_allowed` if present
- Drop `subscription` and `reports_dl_allowed` from `Meta.fields` list

c) `UserUpdateSerializer` (around line 220):
- Drop `userprofile = UserProfileNestedSerializer(required=False)` line
- In `to_internal_value` allowed set, drop `"userprofile"`

d) `UserCreateSerializer` (around line 175-200):
- Drop `subscription` field if present
- In `to_internal_value` allowed set, drop `"subscription"` if present

e) Other places where `subscription` / `reports_dl_allowed` / `userprofile` appear: grep + remove. After edit: `grep -n "userprofile\|subscription\|reports_dl_allowed" web/apiv3/serializers.py` should return zero matches.

- [ ] **Step 7: Delete UserProfile-related tests**

```bash
cd /Users/lamba/github/cape
# Adjust me_view test
```

In `tests/web/test_apiv3_me_view.py`: drop any test asserting `subscription` or `reports_dl_allowed` keys in the response. Add:

```python
@pytest.mark.django_db
def test_me_view_omits_subscription_and_reports_dl_allowed(regular_client):
    c, _ = regular_client
    resp = c.get("/api/v3/me/")
    body = resp.json()
    assert "subscription" not in body
    assert "reports_dl_allowed" not in body
```

In `tests/web/test_apiv3_me_update.py`: drop any test referencing `userprofile` field updates (those should now fail validation since the field is gone).

- [ ] **Step 8: Run tests + apply migration on 240**

```bash
cd /Users/lamba/github/cape
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  web/users/models.py web/users/migrations/ web/apiv2/throttling.py \
  web/analysis/views.py web/apiv2/views.py web/apiv3/serializers.py web/apiv3/views.py \
  tests/web/ \
  cape@192.168.2.240:/opt/CAPEv2/staged-T2/

sshpass -p cape ssh cape@192.168.2.240 'cp -r /opt/CAPEv2/staged-T2/web /opt/CAPEv2/'
sshpass -p cape ssh cape@192.168.2.240 'cp -r /opt/CAPEv2/staged-T2/tests /opt/CAPEv2/'
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2/web && /etc/poetry/bin/poetry run python manage.py migrate users 2>&1 | tail -5'
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_*.py -q 2>&1 | tail -10'
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web && sleep 3 && curl -s -o /dev/null -w "/api/v3/me/ → %{http_code}\n" http://127.0.0.1:8000/api/v3/me/'
```

Expected: migration applies (`Operations: 1 (drop UserProfile)`), pytest green, /me/ → 401 (anon, OK).

- [ ] **Step 9: Commit**

```bash
git add web/users/ web/apiv2/throttling.py web/analysis/views.py web/apiv2/views.py web/apiv3/serializers.py web/apiv3/views.py tests/web/
git commit -m "feat(backend): drop UserProfile model — global config replaces per-user subscription + reports"
```

---

## Task T3: `/tokens` backend revert (drop has_token filter)

**Files:**
- Modify: `web/apiv3/views.py` `tokens_list` (drop `auth_token__isnull=False` filter)
- Modify: `tests/web/test_apiv3_tokens_list.py` (replace "only returns users with tokens" test)

- [ ] **Step 1: Update `tokens_list` in `web/apiv3/views.py`**

Find `tokens_list` view (around line 720 — was modified in sub-spec #7 A1). Change the queryset:

```python
# Before
qs = (
    User.objects.select_related("auth_token")
    .filter(auth_token__isnull=False)
    .order_by("id")
)

# After (revert sub-spec #7 list semantics; keep key serialization)
qs = User.objects.select_related("auth_token").order_by("id")
```

Also update the `extend_schema` description to reflect that all users are returned (with `key` null when no token).

- [ ] **Step 2: Adjust `tests/web/test_apiv3_tokens_list.py`**

Replace `test_tokens_list_only_returns_users_with_tokens` with:

```python
@pytest.mark.django_db
def test_tokens_list_returns_all_users_token_or_not(admin_client):
    c, _admin = admin_client  # admin has token (fixture creates it)
    User.objects.create_user(username="bob")  # no token
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    rows = {row["username"]: row for row in resp.json()["data"]}
    # All 3 users present.
    assert {"adm-tk", "alice", "bob"} <= set(rows.keys())
    # bob's row has key=null since no token.
    assert rows["bob"]["key"] is None
    assert rows["bob"]["has_token"] is False
    # alice's row has full 40-char hex key.
    assert rows["alice"]["has_token"] is True
    assert isinstance(rows["alice"]["key"], str) and len(rows["alice"]["key"]) == 40
```

The other 5 tests in the file stay as-is (envelope shape, search, cursor pagination, non-staff 403, anonymous 401).

- [ ] **Step 3: Run tests on 240 + restart cape-web**

```bash
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  web/apiv3/views.py tests/web/test_apiv3_tokens_list.py \
  cape@192.168.2.240:/opt/CAPEv2/staged-T3/

sshpass -p cape ssh cape@192.168.2.240 'cp /opt/CAPEv2/staged-T3/views.py /opt/CAPEv2/web/apiv3/views.py'
sshpass -p cape ssh cape@192.168.2.240 'cp /opt/CAPEv2/staged-T3/test_apiv3_tokens_list.py /opt/CAPEv2/tests/web/test_apiv3_tokens_list.py'
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_tokens_list.py -v 2>&1 | tail -10'
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web'
```

Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add web/apiv3/views.py tests/web/test_apiv3_tokens_list.py
git commit -m "feat(apiv3): /tokens revert sub-spec #7 list filter — return all users"
```

---

## Task T4: Frontend deletes + `/users/<id>` single-page rewrite

**Files:**
- Delete: `frontend/app/src/routes/groups.tsx`, `groups-new.tsx`, `groups-detail.tsx`
- Delete: `frontend/app/src/components/groups/` (entire dir)
- Delete: `frontend/app/src/components/users/{PermissionsPicker,GroupsPicker,HistoryTab,TokenSection}.tsx`
- Delete: `frontend/app/src/hooks/useGroups.ts`
- Delete: `frontend/app/src/lib/api/groups.ts`
- Delete: `frontend/app/tests/e2e/groups-management.spec.mjs`
- Modify: `frontend/app/src/router.tsx`, `Sidebar.tsx`, `lib/api/users.ts`, `lib/query-keys.ts`
- Rewrite: `frontend/app/src/routes/users-detail.tsx`
- Modify: `frontend/app/src/routes/users-new.tsx`

- [ ] **Step 1: Delete groups SPA files**

```bash
cd /Users/lamba/github/cape
git rm frontend/app/src/routes/groups.tsx
git rm frontend/app/src/routes/groups-new.tsx
git rm frontend/app/src/routes/groups-detail.tsx
git rm -r frontend/app/src/components/groups/
git rm frontend/app/src/components/users/PermissionsPicker.tsx
git rm frontend/app/src/components/users/GroupsPicker.tsx
git rm frontend/app/src/components/users/HistoryTab.tsx
git rm frontend/app/src/components/users/TokenSection.tsx
git rm frontend/app/src/hooks/useGroups.ts
git rm frontend/app/src/lib/api/groups.ts
git rm frontend/app/tests/e2e/groups-management.spec.mjs
```

- [ ] **Step 2: Update `frontend/app/src/router.tsx`**

Find and delete:
- `const GroupsRoute = lazy(() => import("./routes/groups"));`
- `const GroupsNewRoute = lazy(() => import("./routes/groups-new"));`
- `const GroupsDetailRoute = lazy(() => import("./routes/groups-detail"));`
- The 3 `{ path: "groups...", element: ... }` route entries

After: `grep -n "groups" frontend/app/src/router.tsx` returns zero.

- [ ] **Step 3: Update `frontend/app/src/components/shell/Sidebar.tsx`**

Delete the line:

```typescript
{ to: "/groups", label: "Groups", icon: Icon.groupsRound, staffOnly: true },
```

The `Icon.groupsRound` constant in `icons.tsx` can stay (used elsewhere or harmless if unused).

- [ ] **Step 4: Update `frontend/app/src/lib/api/users.ts`**

Delete the functions `setUserGroups` and `setUserPermissions`. Delete any types they exclusively use (e.g., `SetGroupsPayload`, `SetPermissionsPayload`).

After edit: `grep -n "setUserGroups\|setUserPermissions" frontend/app/src/` should return zero except in deleted files.

- [ ] **Step 5: Update `frontend/app/src/lib/query-keys.ts`**

Delete the entire `groups: { ... }` block. Drop the import `import type { GroupListFilters } from "@/lib/api/groups";` (since groups.ts is deleted).

Also drop the `permissions: { ... }` block if it exists (was paired with permissions endpoint).

- [ ] **Step 6: Rewrite `frontend/app/src/routes/users-detail.tsx`**

Replace the file's entire contents with:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/shared/Toast";
import { SetPasswordModal } from "@/components/users/SetPasswordModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDetail } from "@/hooks/useUsers";
import { deleteUser, updateUser, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  background: "var(--color-bg-2)",
  border: "1px solid var(--color-border)",
  borderRadius: 3,
  fontSize: 12,
  width: "100%",
};

const inputStyleRO: React.CSSProperties = { ...inputStyle, opacity: 0.6 };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, color: "var(--color-fg-2)", marginBottom: 3 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label, checked, onChange, disabled,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label}
    </label>
  );
}

export default function UsersDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const userQ = useUserDetail(id);

  if (me.isLoading || userQ.isLoading) {
    return <Centered><Spinner size={14} /></Centered>;
  }
  if (!me.data?.is_superuser) {
    navigate("/", { replace: true });
    return null;
  }
  if (userQ.error || !userQ.data) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
        <Alert variant="destructive">
          <AlertTitle>User not found</AlertTitle>
          <AlertDescription>{userQ.error ? String(userQ.error) : "Unknown user"}</AlertDescription>
        </Alert>
      </div>
    );
  }
  return <Page user={userQ.data} />;
}

function Page({ user }: { user: UserDetail }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isSelf = me.data?.username === user.username;
  const meIsSuper = !!me.data?.is_superuser;

  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isSuper, setIsSuper] = useState(user.is_superuser);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    setEmail(user.email);
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setIsActive(user.is_active);
    setIsSuper(user.is_superuser);
  }, [user]);

  const update = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        email,
        first_name: firstName,
        last_name: lastName,
        is_active: isActive,
        is_superuser: isSuper,
      }),
    onSuccess: () => {
      showToast("User updated.", "success");
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(user.id) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: () => showToast("Update failed.", "error"),
  });

  const del = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      showToast(`Deleted ${user.username}.`, "success");
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      navigate("/users");
    },
    onError: () => showToast("Delete failed.", "error"),
  });

  function confirmDelete() {
    if (!window.confirm(`Delete user ${user.username}? This cannot be undone.`)) return;
    del.mutate();
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", user.username]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 540 }}>
          <h2 className="panel-h" style={{ margin: 0 }}>{user.username}</h2>
          <div style={{ padding: 14, display: "grid", gap: 10 }}>
            <Field label="Username (read-only)">
              <input readOnly value={user.username} style={inputStyleRO} />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="First name">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Toggle label="Active" checked={isActive} onChange={setIsActive} disabled={isSelf} />
            {meIsSuper && (
              <Toggle label="Superuser" checked={isSuper} onChange={setIsSuper} />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn primary"
                onClick={() => update.mutate()}
                disabled={update.isPending}
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
              <button className="btn" onClick={() => setPwOpen(true)}>
                Set password
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn danger"
                onClick={confirmDelete}
                disabled={isSelf || del.isPending}
              >
                {del.isPending ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <SetPasswordModal
        open={pwOpen}
        onOpenChange={setPwOpen}
        userId={user.id}
        username={user.username}
      />
    </>
  );
}
```

This rewrite drops: tab UI; `Groups`, `Permissions`, `API Token`, `Profile`, `History` tabs; `is_staff` toggle; UserProfile-related state. Adds: superuser-only auth gate (`!me.data?.is_superuser`).

- [ ] **Step 7: Update `frontend/app/src/routes/users-new.tsx`**

Find the `is_staff` checkbox JSX block — delete it. Find the `is_staff` form field state (`useState`) — delete it. Find the call to `createUser({...})` — drop `is_staff` from the payload. (The backend will auto-sync `is_staff` from `is_superuser`.)

After edit: `grep -n "is_staff" frontend/app/src/routes/users-new.tsx` returns zero matches.

- [ ] **Step 8: Typecheck + build**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
```

Expected: clean. If typecheck fails:
- "Cannot find module '@/components/users/HistoryTab'" → search for stale imports of deleted components.
- "Property 'is_staff' does not exist" → check users-new + users-detail haven't kept stale references.

- [ ] **Step 9: Deploy SPA + smoke**

```bash
cd /Users/lamba/github/cape
sshpass -p cape ssh cape@192.168.2.240 'mkdir -p /opt/CAPEv2/web/static/spa'
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  frontend/app/dist/ cape@192.168.2.240:/opt/CAPEv2/web/static/spa/
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "/users → %{http_code}\n/users/1 → %{http_code}\n/groups → %{http_code}\n" \
  http://192.168.2.240:8000/users \
  http://192.168.2.240:8000/users/1 \
  http://192.168.2.240:8000/groups
```

Expected: `/users → 302`, `/users/1 → 302`, `/groups → 302` (anon redirect; SPA wired). After login, `/groups` should land at the SPA 404 page (route deleted).

- [ ] **Step 10: Commit**

```bash
git add frontend/app/src/router.tsx frontend/app/src/components/shell/Sidebar.tsx \
  frontend/app/src/lib/api/users.ts frontend/app/src/lib/query-keys.ts \
  frontend/app/src/routes/users-detail.tsx frontend/app/src/routes/users-new.tsx
git commit -m "feat(spa): drop groups SPA + collapse /users/<id> to single page + drop is_staff toggle"
```

---

## Task T5: `/tokens` frontend revert + e2e adjustments + final push

**Files:**
- Modify: `frontend/app/src/components/tokens/TokenListTable.tsx` (Generate row when key=null)
- Modify: `frontend/app/src/routes/tokens.tsx` (re-add onGenerate)
- Modify: `frontend/app/tests/e2e/tokens-management.spec.mjs` (test 4: revoke leaves row visible)
- Modify: `frontend/app/tests/e2e/users-management.spec.mjs` (drop tab navigation; verify token at /tokens)

- [ ] **Step 1: Update `TokenListTable.tsx` to render Generate when key=null**

In `frontend/app/src/components/tokens/TokenListTable.tsx`, modify the row rendering. Find the `<td>` for the Token column and the `<td>` for Actions. Replace the body of the table-row map function:

```tsx
{rows.map((row) => {
  const busy = pendingUserId === row.user_id;
  const revealed = revealedIds.has(row.user_id);
  const display = row.key ? (revealed ? row.key : maskToken(row.key)) : "—";
  return (
    <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
      <td>
        {row.key ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <code
              className="mono"
              style={{
                padding: "3px 6px",
                background: "var(--color-bg-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 3,
                wordBreak: "break-all",
                flex: 1,
              }}
            >
              {display}
            </code>
            <button
              type="button"
              className="btn ghost"
              title={revealed ? "Hide" : "Reveal"}
              onClick={() => toggleReveal(row.user_id)}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {revealed && (
              <button
                type="button"
                className="btn ghost"
                title="Copy"
                onClick={() => copy(row.key!)}
              >
                <Copy size={14} />
              </button>
            )}
          </div>
        ) : (
          <span className="dim">⊘ None</span>
        )}
      </td>
      <td>
        <div>
          <Link to={`/users/${row.user_id}`} style={{ fontWeight: 600 }}>
            {row.username}
          </Link>
        </div>
        <div className="dim" style={{ fontSize: 11 }}>
          {row.email || "—"}
        </div>
      </td>
      <td className="dim">
        {row.token_created
          ? new Date(row.token_created).toISOString().slice(0, 10)
          : "—"}
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          {row.key ? (
            <>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => onRotate(row)}
              >
                {busy ? "…" : "Rotate"}
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={busy}
                onClick={() => onRevoke(row)}
              >
                Revoke
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => onGenerate(row)}
            >
              {busy ? "…" : "Generate"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
})}
```

Update the `Props` interface to add `onGenerate`:

```tsx
interface Props {
  rows: AdminTokenRow[];
  onGenerate: (row: AdminTokenRow) => void;
  onRotate: (row: AdminTokenRow) => void;
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}
```

And the function signature:

```tsx
export function TokenListTable({ rows, onGenerate, onRotate, onRevoke, pendingUserId }: Props) {
```

- [ ] **Step 2: Re-add `onGenerate` to `routes/tokens.tsx`**

In `frontend/app/src/routes/tokens.tsx`, find the rotateM mutation. Re-add the `onGenerate` callback above `onRotate`:

```tsx
function onGenerate(row: AdminTokenRow) {
  if (pendingUserId !== null) return;
  if (!window.confirm(`Generate API token for ${row.username}?`)) return;
  rotateM.mutate(row.user_id);
}
```

(rotateUserToken handles "create or rotate" semantics in DRF — same endpoint POST creates if absent, replaces if present. So onGenerate piggybacks on rotateM.)

Update the `<TokenListTable>` JSX call site to pass `onGenerate`:

```tsx
<TokenListTable
  rows={rows}
  onGenerate={onGenerate}
  onRotate={onRotate}
  onRevoke={onRevoke}
  pendingUserId={pendingUserId}
/>
```

- [ ] **Step 3: Adjust e2e `tokens-management.spec.mjs`**

In `frontend/app/tests/e2e/tokens-management.spec.mjs`, find test 4 ("temp user appears after token generation, then rotate + revoke removes it"). The Revoke step currently expects the row to disappear. Change to expect the row to remain with a Generate button:

```javascript
// 5. Revoke — row stays visible but Token column shows ⊘ None and a Generate button replaces Rotate/Revoke.
page.once("dialog", (d) => d.accept());
await row.getByRole("button", { name: /^Revoke$/ }).click();
await expect(row.getByRole("button", { name: /^Generate$/ })).toBeVisible({ timeout: 8000 });
await expect(row).toContainText("⊘");
```

Also update test 4 step 2 (the user-detail Tokens tab generate path) — that tab is GONE now. Replace with: navigate to `/tokens?search=<tmpUser>`, find the row, click Generate (now in the row), then proceed to test the reveal/copy/rotate/revoke flow.

Final test 4 body:

```javascript
test("generate → rotate (with reveal modal) → revoke leaves row with Generate button", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new.
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. Open /tokens, find the tmpUser row, click Generate.
  await page.goto(`${SPA}/tokens?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible();
  await expect(row).toContainText("⊘");

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Generate$/ }).click();

  // 3. RevealDialog opens with the new full key.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog.locator("code")).toHaveText(/^[a-f0-9]{30,}$/);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 4. Row now shows masked token + Rotate / Revoke.
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);

  // 5. Rotate: another RevealDialog with new key.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Rotate$/ }).click();
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 6. Revoke: row remains, Token col shows ⊘, Generate button replaces Rotate/Revoke.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row.getByRole("button", { name: /^Generate$/ })).toBeVisible({ timeout: 8000 });
  await expect(row).toContainText("⊘");

  // 7. Cleanup: delete the temp user.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});
```

The other 3 tests (sidebar, list rendering, reveal/copy/hide) stay as-is.

- [ ] **Step 4: Adjust e2e `users-management.spec.mjs`**

In `frontend/app/tests/e2e/users-management.spec.mjs`, the existing test "create + edit + delete e2e-tmp user" likely walks through tabs. Drop those tab assertions. The new /users/<id> is a single page, so the test should:

1. Create user via /users/new → land on /users/<id>
2. Verify Basic fields are editable (email, first/last name, Active, Superuser)
3. Hit Save (no tab switching needed)
4. Hit Delete user → land back at /users

Replace the test body — read the existing file first to identify the exact test name and its position. Update the assertions to NOT navigate by tab buttons. Keep the avatar dropdown test as-is.

The existing "/users/<id> History tab" test (added in sub-spec #4) should be DELETED entirely since the History tab is gone.

If the file ends up with just 2-3 tests, that's fine — the user-mgmt surface is now small.

- [ ] **Step 5: Typecheck + build**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 6: Deploy SPA + run e2e on 240**

```bash
cd /Users/lamba/github/cape
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  frontend/app/dist/ cape@192.168.2.240:/opt/CAPEv2/web/static/spa/
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web'
sleep 4

cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.2.240:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS=admin \
  npx playwright test --reporter=line
```

Expected: all tests pass. Specifically tokens-management.spec.mjs (4) + users-management.spec.mjs (whatever count after edits).

If a test fails:
- Token revoke flow → check TokenListTable Generate button is rendered when key=null in the deployed bundle.
- Users-mgmt test references deleted tab buttons → delete those assertions.
- Do NOT skip / `.skip` / `.only`.

- [ ] **Step 7: Commit + push**

```bash
cd /Users/lamba/github/cape
git add frontend/app/src/components/tokens/TokenListTable.tsx \
  frontend/app/src/routes/tokens.tsx \
  frontend/app/tests/e2e/tokens-management.spec.mjs \
  frontend/app/tests/e2e/users-management.spec.mjs
git commit -m "feat(spa): /tokens revert sub-spec #7 list filter + restore Generate inline + e2e fix"
git push origin refactor/web-spa
```

Expected: 5 new commits land on `origin/refactor/web-spa` (T1-T5).

---

## Self-Review Notes (controller filled — do not action)

**Spec coverage:**
- Spec §3 architecture overview → Tasks T1 (delete groups + IsSuperUser) + T2 (UserProfile) + T3 (tokens BE) + T4 (frontend deletes + /users/<id>) + T5 (tokens FE)
- Spec §4.1 IsSuperUser → T1.1
- Spec §4.2 IsAdminUser swap → T1.2
- Spec §4.3 group/permission endpoint deletion → T1.3 + T1.5 + T1.6
- Spec §4.4 is_staff auto-sync → T1.4
- Spec §4.5 UserSerializer m2m field deletion → T1.6
- Spec §4.6 /tokens BE revert → T3
- Spec §4.7 UserProfile delete + apiv2 throttling rewire + reports check → T2 (entire task)
- Spec §4.8 audit ACTION cleanup → T1.7
- Spec §5.1 SPA file deletion → T4.1
- Spec §5.2 modify file list → T4.2-T4.7
- Spec §5.3 /users/<id> single-page rewrite → T4.6
- Spec §5.4 /tokens FE revert → T5.1-T5.2
- Spec §5.5/5.6 sidebar + router cleanup → T4.2-T4.3
- Spec §7 audit unchanged (delete 3 ACTIONs) → T1.7
- Spec §8 testing → T1.8-T1.9 + T2.7 + T3.2 + T5.3-T5.4
- Spec §9 deployment → T2.8 (migration) + T4.9 (SPA) + T5.6 (final)

**Placeholder scan:** clean — all steps include exact verbatim code, exact commands, expected output. Edge cases (e.g., admin token already exists on 240) are noted in surrounding context.

**Type consistency:** `IsSuperUser` (T1.1) consumed verbatim in T1.2 swap. `is_staff` auto-sync logic (T1.4) bridges drop in serializer (T1.6) — consistent. `UserDetail` type in `users-detail.tsx` rewrite (T4.6) drops `groups`, `user_permissions`, `subscription`, `userprofile`, `is_staff` keys; matches what T1.6 + T2.6 remove from `UserSerializer`. `AdminTokenRow.key` (already added in sub-spec #7) consumed by both has-token branch (mono mask + reveal) and no-token branch (`⊘ None` + Generate) in T5.1 — same field, two branches.

**Risk note:** Task T4 deletes `TokenSection.tsx` which was `/users/<id>/Tokens` tab. Sub-spec #7 e2e test 4 generates the temp user's token from there. Task T5.3 redirects this flow to `/tokens` page Generate. Order matters — T4 must land before T5 e2e runs, OR the e2e test skips temporarily. Since both T4 + T5 are committed in sequence and e2e runs in T5.6 (after both), this is safe.
