# SPA-Native 用户管理 + API Token 管理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPA `/users` route 替代 Django `/admin/auth/user/` 作为主用户管理 UX；19 个新 apiv3 endpoint + 9 个新 audit ACTION + 自服务/管理员 API token 管理 (avatar 下拉 + UserDetailPage tab)。

**Architecture:** Backend-first（Phase A-D 全部 pytest 落地后再开 frontend）；Phase F-K 增量构建 SPA UI 复用已有 `Dialog` / `Toast` / TanStack Query / staffOnly NavItem 基础设施。Token 管理用 DRF 默认 `rest_framework.authtoken.models.Token` (1-per-user) — 不引第三方依赖。Sidebar `Users` 链接从 external `/admin/auth/user/` 切到 internal SPA `/users`。

**Tech Stack:** Django 5.1 + DRF + drf-spectacular, React 18 + Vite 6 + radix-ui (`@radix-ui/react-dialog` already installed) + TanStack Query v5 + Playwright. Branch: `refactor/web-spa`. Spec: `docs/superpowers/specs/2026-05-03-spa-user-management-design.md` (commit `67d47c4e`).

---

## Common Patterns (apply to every task)

### Remote test runner
Local has no Django; tests run on `192.168.1.6:8000` (`ubuntu/ubuntu` SSH, `cape` user, `/opt/CAPEv2/.venv/`). Pattern after edits:

```bash
sshpass -p ubuntu rsync -av <files> ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/<file> /opt/CAPEv2/<dest> \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/<dest> \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest <test-path> -v 2>&1 | tail -10'
```

### Commit message format
- `feat(apiv3): <verb><object>` for new endpoints
- `feat(audit_log): <thing>` for ACTION additions
- `feat(spa): <thing>` for new SPA components / routes
- `feat(sidebar/topbar): <thing>` for shell changes
- `test: <thing>` for test-only commits
- `docs: <thing>` for doc-only commits

### TDD discipline
Each task: write failing test → run → confirm fail → implement → run → confirm pass → commit.

---

## Pre-flight

### Task 0: branch state + baseline e2e

**Files:** none modified.

- [ ] **Step 1: confirm branch + clean tree**

```bash
cd /Users/lamba/github/cape
git status
git branch --show-current
```

Expected: branch = `refactor/web-spa`, tree clean (only the just-committed spec ahead of origin).

- [ ] **Step 2: baseline e2e against 192.168.1.6**

```bash
cd frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 \
  SPA_LOGIN_USER=admin SPA_LOGIN_PASS='cape123!' \
  npx playwright test tests/e2e/audit-log.spec.mjs tests/e2e/account-self-service.spec.mjs --reporter=line
```

Expected: 7 passed (3 audit-log + 4 account-self-service).

If pool exhausted: `sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S systemctl restart cape-web'` and re-run.

- [ ] **Step 3: no commit needed** — observation only.

---

## Phase A — apiv3 user list/get + audit ACTIONS

### Task A1: add 9 audit ACTIONS

**Files:**
- Modify: `web/audit_log/__init__.py`
- Test: `tests/web/test_audit_log_user_actions.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_audit_log_user_actions.py
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
```

- [ ] **Step 2: run remote, expect FAIL** — see Common Patterns. ImportError-free; assertion will list 9 missing tuples.

- [ ] **Step 3: implement — append to ACTIONS tuple in `web/audit_log/__init__.py`**

Find `ACTIONS = (...)`. Add the 9 entries verbatim from the test's `EXPECTED` set. Place them after the existing entries; tuple order is irrelevant to the test.

- [ ] **Step 4: rerun remote, expect PASS**

- [ ] **Step 5: commit**

```bash
git add web/audit_log/__init__.py tests/web/test_audit_log_user_actions.py
git commit -m "feat(audit_log): add 9 ACTIONS for user-mgmt + token

user_create / user_update / user_delete / user_activate /
user_deactivate / user_set_password (user_mgmt category) +
token_create / token_rotate / token_revoke (auth category).

Each apiv3 user-mgmt + token mutation view will explicitly call
audit.log() with the matching action key."
```

---

### Task A2: UserSerializer + UserListSerializer (read-only shapes)

**Files:**
- Modify: `web/apiv3/serializers.py` (append after existing user serializers around line 90)
- Test: `tests/web/test_apiv3_user_serializers.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_user_serializers.py
"""Lock-in for UserSerializer + UserListSerializer field shape."""
import pytest
from django.contrib.auth.models import Group, Permission, User

from apiv3.serializers import UserSerializer, UserListSerializer


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
    # has_token + token nested only present when caller is admin —
    # the serializer itself always emits has_token; token field is
    # populated by the view.
    assert "has_token" in data
```

- [ ] **Step 2: run remote, expect FAIL** with ImportError.

- [ ] **Step 3: implement — append to `web/apiv3/serializers.py`**

```python
class UserListSerializer(serializers.ModelSerializer):
    """Compact user row for /api/v3/users/ list endpoint."""

    group_count = serializers.SerializerMethodField()
    has_token = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    class Meta:
        model = __import__("django.contrib.auth.models", fromlist=["User"]).User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "is_active",
            "last_login", "date_joined",
            "group_count", "has_token", "subscription",
        )

    def get_group_count(self, obj):
        return obj.groups.count()

    def get_has_token(self, obj):
        from rest_framework.authtoken.models import Token
        return Token.objects.filter(user=obj).exists()

    def get_subscription(self, obj):
        prof = getattr(obj, "userprofile", None)
        return getattr(prof, "subscription", None) if prof else None


class UserProfileNestedSerializer(serializers.Serializer):
    """Inline UserProfile for full UserSerializer."""
    subscription = serializers.CharField(allow_blank=True, required=False)
    reports = serializers.BooleanField(required=False)


class UserSerializer(serializers.ModelSerializer):
    """Full user representation for /api/v3/users/<id>/ detail endpoint."""

    group_ids = serializers.SerializerMethodField()
    permission_ids = serializers.SerializerMethodField()
    userprofile = serializers.SerializerMethodField()
    has_token = serializers.SerializerMethodField()

    class Meta:
        model = __import__("django.contrib.auth.models", fromlist=["User"]).User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "is_active",
            "last_login", "date_joined",
            "group_ids", "permission_ids", "userprofile", "has_token",
        )

    def get_group_ids(self, obj):
        return list(obj.groups.values_list("id", flat=True))

    def get_permission_ids(self, obj):
        return list(obj.user_permissions.values_list("id", flat=True))

    def get_userprofile(self, obj):
        prof = getattr(obj, "userprofile", None)
        if not prof:
            return None
        return {
            "subscription": prof.subscription,
            "reports": prof.reports,
        }

    def get_has_token(self, obj):
        from rest_framework.authtoken.models import Token
        return Token.objects.filter(user=obj).exists()
```

(The `__import__` dance for `Meta.model` avoids a top-level `from django.contrib.auth.models import User` that could reorder; the existing serializer file uses lazy patterns elsewhere. If the file already has that import, replace `__import__(...)` with `User` directly.)

Verify with grep:
```bash
grep -n "from django.contrib.auth.models import User" web/apiv3/serializers.py
```

If User is imported, simplify both `Meta.model = User`.

- [ ] **Step 4: rerun, expect PASS**

- [ ] **Step 5: commit**

```bash
git add web/apiv3/serializers.py tests/web/test_apiv3_user_serializers.py
git commit -m "feat(apiv3): UserListSerializer + UserSerializer for /users/ + /users/<id>/"
```

---

### Task A3: GET /api/v3/users/ list view

**Files:**
- Modify: `web/apiv3/views.py` (add new view after `me` view)
- Modify: `web/apiv3/urls.py` (add route)
- Test: `tests/web/test_apiv3_users_list.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_users_list.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    admin = User.objects.create_user(username="admin-tst", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=admin)
    return c, admin


@pytest.fixture
def regular_client():
    user = User.objects.create_user(username="user-tst", password="x")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, user


@pytest.mark.django_db
def test_list_returns_admin_self(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/users/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "next_cursor" in body
    assert "total" in body
    assert any(u["username"] == "admin-tst" for u in body["data"])


@pytest.mark.django_db
def test_list_search_username(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="alice")
    User.objects.create_user(username="bob")
    resp = c.get("/api/v3/users/?search=alic")
    assert resp.status_code == 200
    names = {u["username"] for u in resp.json()["data"]}
    assert "alice" in names and "bob" not in names


@pytest.mark.django_db
def test_list_filter_is_staff(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="alice", is_staff=False)
    User.objects.create_user(username="bob", is_staff=True)
    resp = c.get("/api/v3/users/?is_staff=true")
    names = {u["username"] for u in resp.json()["data"]}
    assert "bob" in names and "alice" not in names


@pytest.mark.django_db
def test_list_pagination_limit(admin_client):
    c, _ = admin_client
    for i in range(25):
        User.objects.create_user(username=f"u{i}")
    resp = c.get("/api/v3/users/?limit=5")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 5
    assert body["next_cursor"] is not None


@pytest.mark.django_db
def test_list_rejects_non_staff(regular_client):
    c, _ = regular_client
    assert c.get("/api/v3/users/").status_code == 403


@pytest.mark.django_db
def test_list_rejects_anonymous():
    assert APIClient().get("/api/v3/users/").status_code == 401
```

- [ ] **Step 2: run remote, expect FAIL** with 404 (URL not registered).

- [ ] **Step 3: implement view in `web/apiv3/views.py`**

After the `me` view + before the `system_info` view (or any logical spot), add:

```python
@extend_schema(
    tags=["users"],
    summary="List users (admin only).",
    parameters=[
        OpenApiParameter(name="search", type=OpenApiTypes.STR, required=False),
        OpenApiParameter(name="is_staff", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="is_superuser", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="is_active", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="group", type=OpenApiTypes.STR, required=False),
        OpenApiParameter(name="cursor", type=OpenApiTypes.INT, required=False),
        OpenApiParameter(name="limit", type=OpenApiTypes.INT, required=False),
        OpenApiParameter(name="ordering", type=OpenApiTypes.STR, required=False),
    ],
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def users_list(request: Request) -> Response:
    from django.contrib.auth.models import User
    qs = User.objects.all().select_related("userprofile").prefetch_related("groups")

    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(username__icontains=search)
            | Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    for fld in ("is_staff", "is_superuser", "is_active"):
        v = request.query_params.get(fld)
        if v is not None:
            qs = qs.filter(**{fld: v.lower() in ("1", "true", "yes")})

    group = request.query_params.get("group")
    if group:
        if group.isdigit():
            qs = qs.filter(groups__id=int(group))
        else:
            qs = qs.filter(groups__name=group)

    ordering = request.query_params.get("ordering") or "-date_joined"
    allowed = {"username", "-username", "date_joined", "-date_joined",
               "last_login", "-last_login"}
    if ordering not in allowed:
        ordering = "-date_joined"
    qs = qs.order_by(ordering, "id")

    total = qs.count()

    cursor = request.query_params.get("cursor")
    if cursor and cursor.isdigit():
        qs = qs.filter(id__lt=int(cursor))

    try:
        limit = int(request.query_params.get("limit") or 20)
    except ValueError:
        limit = 20
    limit = max(1, min(limit, 100))

    rows = list(qs[: limit + 1])
    next_cursor = rows[limit].id if len(rows) > limit else None
    rows = rows[:limit]

    return Response({
        "data": UserListSerializer(rows, many=True).data,
        "next_cursor": next_cursor,
        "total": total,
    })
```

Add `UserListSerializer` to the serializer-import block at top of `views.py`.

- [ ] **Step 4: register URL in `web/apiv3/urls.py`**

After the existing `path("me/password/", views.me_password_change, name="me-password-change")`:

```python
    # Users (admin)
    path("users/", views.users_list, name="users-list"),
```

- [ ] **Step 5: rerun, expect 6 PASS**

- [ ] **Step 6: commit**

```bash
git add web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_users_list.py
git commit -m "feat(apiv3): GET /users/ — admin user list with search/filter/cursor pagination"
```

---

### Task A4: GET /api/v3/users/<id>/ detail view

**Files:**
- Modify: `web/apiv3/views.py`
- Modify: `web/apiv3/urls.py`
- Test: `tests/web/test_apiv3_users_detail.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_users_detail.py
import pytest
from django.contrib.auth.models import Group, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    admin = User.objects.create_user(username="admin-d", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user=admin)
    return c, admin


@pytest.mark.django_db
def test_detail_returns_full_shape(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice", email="a@x.com")
    g = Group.objects.create(name="testgroup")
    target.groups.add(g)
    resp = c.get(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "alice"
    assert body["group_ids"] == [g.id]
    assert "permission_ids" in body
    assert "userprofile" in body
    assert "has_token" in body


@pytest.mark.django_db
def test_detail_404_for_unknown(admin_client):
    c, _ = admin_client
    assert c.get("/api/v3/users/99999/").status_code == 404


@pytest.mark.django_db
def test_detail_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient(); c.force_authenticate(user=user)
    target = User.objects.create_user(username="someone")
    assert c.get(f"/api/v3/users/{target.id}/").status_code == 403
```

- [ ] **Step 2: run, expect FAIL with 404**

- [ ] **Step 3: implement**

In `web/apiv3/views.py` after `users_list`:

```python
@extend_schema(tags=["users"], summary="User detail (admin only).")
@api_view(["GET"])
@permission_classes([IsAdminUser])
def users_detail(_request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(
        User.objects.select_related("userprofile").prefetch_related("groups", "user_permissions"),
        pk=user_id,
    )
    return Response(UserSerializer(user).data)
```

Add `UserSerializer` to the imports.

- [ ] **Step 4: register URL in `web/apiv3/urls.py`**

```python
    path("users/<int:user_id>/", views.users_detail, name="users-detail"),
```

- [ ] **Step 5: rerun, expect 3 PASS**

- [ ] **Step 6: commit**

```bash
git add web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_users_detail.py
git commit -m "feat(apiv3): GET /users/<id>/ — full user detail with group/permission ids"
```

---

## Phase B — User CRUD mutations

### Task B1: POST /api/v3/users/ create

**Files:**
- Modify: `web/apiv3/serializers.py` (add UserCreateSerializer)
- Modify: `web/apiv3/views.py` (extend users_list view to handle POST OR add new function)
- Test: `tests/web/test_apiv3_users_create.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_users_create.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="admincre", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture
def superuser_client():
    a = User.objects.create_user(username="superuser1", password="x", is_staff=True, is_superuser=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c


@pytest.mark.django_db
def test_create_basic(admin_client):
    c, _ = admin_client
    resp = c.post(
        "/api/v3/users/",
        {"username": "alice2", "password": "InitialPass987Strong!", "email": "a@x.com"},
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["username"] == "alice2"
    u = User.objects.get(username="alice2")
    assert u.check_password("InitialPass987Strong!")


@pytest.mark.django_db
def test_create_audit_emitted(admin_client):
    c, admin = admin_client
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_create").delete()
    c.post(
        "/api/v3/users/",
        {"username": "bob2", "password": "InitialPass987Strong!"},
        format="json",
    )
    events = AuditEvent.objects.filter(action="user_create")
    assert events.count() == 1
    e = events.first()
    assert e.actor_username == admin.username


@pytest.mark.django_db
def test_create_duplicate_username(admin_client):
    c, _ = admin_client
    User.objects.create_user(username="dup")
    resp = c.post(
        "/api/v3/users/",
        {"username": "dup", "password": "InitialPass987Strong!"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_weak_password(admin_client):
    from django.test.utils import override_settings
    c, _ = admin_client
    with override_settings(AUTH_PASSWORD_VALIDATORS=[
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
         "OPTIONS": {"min_length": 8}}
    ]):
        resp = c.post(
            "/api/v3/users/",
            {"username": "weakpw", "password": "abc"},
            format="json",
        )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_non_superuser_cannot_set_superuser(admin_client):
    c, _ = admin_client  # admin is NOT superuser
    resp = c.post(
        "/api/v3/users/",
        {"username": "wannabe", "password": "InitialPass987Strong!", "is_superuser": True},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_superuser_can_set_superuser(superuser_client):
    c = superuser_client
    resp = c.post(
        "/api/v3/users/",
        {"username": "newsuper", "password": "InitialPass987Strong!", "is_superuser": True},
        format="json",
    )
    assert resp.status_code == 201
    assert User.objects.get(username="newsuper").is_superuser is True


@pytest.mark.django_db
def test_create_rejects_non_staff():
    c = APIClient()
    c.force_authenticate(user=User.objects.create_user(username="reg"))
    assert c.post("/api/v3/users/", {"username": "x", "password": "x"}, format="json").status_code == 403
```

- [ ] **Step 2: run, expect 7 FAIL with 405 (POST not allowed)**

- [ ] **Step 3: implement UserCreateSerializer in `web/apiv3/serializers.py`**

After `UserSerializer`:

```python
class UserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_staff = serializers.BooleanField(required=False, default=False)
    is_superuser = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        from django.contrib.auth.models import User
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if attrs.get("is_superuser") and request and not request.user.is_superuser:
            raise serializers.ValidationError({"is_superuser": ["Only superuser can create superuser."]})
        return attrs
```

(`DjangoValidationError` is already imported from Task A3 / Phase A2 work; if not, add `from django.core.exceptions import ValidationError as DjangoValidationError`.)

- [ ] **Step 4: extend `users_list` view to handle POST in `web/apiv3/views.py`**

Change the decorator:
```python
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def users_list(request: Request) -> Response:
    if request.method == "POST":
        serializer = UserCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        from django.contrib.auth.models import User
        user = User.objects.create_user(
            username=validated["username"],
            email=validated.get("email") or "",
            password=validated["password"],
            first_name=validated.get("first_name") or "",
            last_name=validated.get("last_name") or "",
        )
        user.is_staff = validated.get("is_staff", False)
        user.is_superuser = validated.get("is_superuser", False)
        user.is_active = validated.get("is_active", True)
        user.save()
        try:
            from audit_log import helpers as audit
            audit.log(
                "user_create", request=request, actor=request.user,
                target_type="user", target_id=str(user.id),
                target_label=user.username,
            )
        except Exception:
            pass
        return Response(UserSerializer(user).data, status=http_status.HTTP_201_CREATED)

    # ... existing GET body unchanged ...
```

Add `UserCreateSerializer` to imports.

- [ ] **Step 5: rerun, expect 7 PASS**

- [ ] **Step 6: commit**

```bash
git add web/apiv3/serializers.py web/apiv3/views.py tests/web/test_apiv3_users_create.py
git commit -m "feat(apiv3): POST /users/ — admin create user

UserCreateSerializer validates username uniqueness + password strength
(AUTH_PASSWORD_VALIDATORS) + non-superuser cannot create superuser.
View calls User.objects.create_user() then sets is_staff / is_superuser /
is_active flags. Emits user_create audit row."
```

---

### Task B2: PATCH + DELETE /api/v3/users/<id>/

**Files:**
- Modify: `web/apiv3/serializers.py` (add UserUpdateSerializer)
- Modify: `web/apiv3/views.py` (extend users_detail to GET + PATCH + DELETE)
- Test: `tests/web/test_apiv3_users_update.py` (new), `tests/web/test_apiv3_users_delete.py` (new)

- [ ] **Step 1: write failing tests**

```python
# tests/web/test_apiv3_users_update.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="admin-u", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_patch_basic_fields(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice", email="old@x.com")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"email": "new@x.com", "first_name": "Alice"},
        format="json",
    )
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.email == "new@x.com"
    assert target.first_name == "Alice"


@pytest.mark.django_db
def test_patch_userprofile_inline(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="bob")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"userprofile": {"subscription": "10/m", "reports": True}},
        format="json",
    )
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.userprofile.subscription == "10/m"
    assert target.userprofile.reports is True


@pytest.mark.django_db
def test_patch_non_superuser_cannot_promote_to_superuser(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice")
    resp = c.patch(
        f"/api/v3/users/{target.id}/",
        {"is_superuser": True}, format="json",
    )
    assert resp.status_code == 400
    target.refresh_from_db()
    assert target.is_superuser is False


@pytest.mark.django_db
def test_patch_cannot_deactivate_self(admin_client):
    c, admin = admin_client
    resp = c.patch(
        f"/api/v3/users/{admin.id}/",
        {"is_active": False}, format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_audit_emitted(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="alice")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_update").delete()
    c.patch(f"/api/v3/users/{target.id}/", {"first_name": "Alice"}, format="json")
    events = AuditEvent.objects.filter(action="user_update")
    assert events.count() == 1
    assert "first_name" in events.first().metadata.get("fields", [])
```

```python
# tests/web/test_apiv3_users_delete.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="admin-del", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture
def superuser_client():
    a = User.objects.create_user(username="su-del", password="x", is_staff=True, is_superuser=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_delete_basic(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="todel")
    resp = c.delete(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 204
    assert not User.objects.filter(pk=target.id).exists()


@pytest.mark.django_db
def test_delete_self_400(admin_client):
    c, admin = admin_client
    assert c.delete(f"/api/v3/users/{admin.id}/").status_code == 400
    assert User.objects.filter(pk=admin.id).exists()


@pytest.mark.django_db
def test_delete_superuser_by_non_superuser_400(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="su", is_superuser=True)
    resp = c.delete(f"/api/v3/users/{target.id}/")
    assert resp.status_code == 400
    assert User.objects.filter(pk=target.id).exists()


@pytest.mark.django_db
def test_delete_superuser_by_superuser_ok(superuser_client):
    c, _ = superuser_client
    target = User.objects.create_user(username="su2", is_superuser=True)
    assert c.delete(f"/api/v3/users/{target.id}/").status_code == 204


@pytest.mark.django_db
def test_delete_audit_emitted(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="logme")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_delete").delete()
    c.delete(f"/api/v3/users/{target.id}/")
    assert AuditEvent.objects.filter(action="user_delete").count() == 1
```

- [ ] **Step 2: run, expect 10 FAIL**

- [ ] **Step 3: implement UserUpdateSerializer in `web/apiv3/serializers.py`**

After `UserCreateSerializer`:

```python
class UserUpdateSerializer(serializers.Serializer):
    """Admin-side user update. Username NOT editable.
    Excludes password (separate endpoint); excludes groups/permissions
    (separate m2m endpoints)."""

    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_staff = serializers.BooleanField(required=False)
    is_superuser = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    userprofile = UserProfileNestedSerializer(required=False)

    def to_internal_value(self, data):
        allowed = {"email", "first_name", "last_name", "is_staff",
                   "is_superuser", "is_active", "userprofile"}
        unknown = set(data.keys()) - allowed
        if unknown:
            raise serializers.ValidationError(
                {key: ["Field not editable; use dedicated endpoint or omit."] for key in unknown}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        request = self.context.get("request")
        target = self.context.get("target")
        if attrs.get("is_superuser") and request and not request.user.is_superuser:
            raise serializers.ValidationError({"is_superuser": ["Only superuser can promote."]})
        if (
            "is_active" in attrs and attrs["is_active"] is False
            and request and target and request.user.id == target.id
        ):
            raise serializers.ValidationError({"is_active": ["Cannot deactivate yourself."]})
        return attrs
```

- [ ] **Step 4: extend `users_detail` to GET + PATCH + DELETE in `web/apiv3/views.py`**

```python
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def users_detail(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(
        User.objects.select_related("userprofile").prefetch_related("groups", "user_permissions"),
        pk=user_id,
    )

    if request.method == "PATCH":
        serializer = UserUpdateSerializer(
            data=request.data, context={"request": request, "target": user}
        )
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        profile_data = validated.pop("userprofile", None)
        changed: list[str] = []
        for field, value in validated.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed.append(field)
        if changed:
            user.save(update_fields=changed)
        if profile_data is not None:
            prof = user.userprofile  # auto-created via post_save signal
            for k, v in profile_data.items():
                if getattr(prof, k) != v:
                    setattr(prof, k, v)
                    changed.append(f"userprofile.{k}")
            prof.save()
        if changed:
            try:
                from audit_log import helpers as audit
                audit.log(
                    "user_update", request=request, actor=request.user,
                    target_type="user", target_id=str(user.id),
                    target_label=user.username, fields=changed,
                )
            except Exception:
                pass
        user.refresh_from_db()
        return Response(UserSerializer(user).data)

    if request.method == "DELETE":
        if user.id == request.user.id:
            return _error("self_delete_forbidden", "Cannot delete yourself.",
                          http_code=http_status.HTTP_400_BAD_REQUEST)
        if user.is_superuser and not request.user.is_superuser:
            return _error("superuser_delete_forbidden", "Only superuser can delete superuser.",
                          http_code=http_status.HTTP_400_BAD_REQUEST)
        username = user.username
        user_id_copy = user.id
        user.delete()
        try:
            from audit_log import helpers as audit
            audit.log(
                "user_delete", request=request, actor=request.user,
                target_type="user", target_id=str(user_id_copy), target_label=username,
            )
        except Exception:
            pass
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    return Response(UserSerializer(user).data)
```

Add `UserUpdateSerializer` to imports.

- [ ] **Step 5: rerun, expect 10 PASS**

- [ ] **Step 6: commit**

```bash
git add web/apiv3/serializers.py web/apiv3/views.py tests/web/test_apiv3_users_update.py tests/web/test_apiv3_users_delete.py
git commit -m "feat(apiv3): PATCH + DELETE /users/<id>/ — admin user update/delete

PATCH validates field allowlist (rejects username/password/groups/
permissions — those go via dedicated endpoints). UserProfile inline
field editable. Three high-risk rules: cannot promote self/others to
superuser unless requester is superuser; cannot deactivate self;
cannot delete self or delete superuser unless requester is superuser.
Both emit audit_log rows (user_update with fields=[...] / user_delete)."
```

---

### Task B3: set-password + activate + deactivate

**Files:**
- Modify: `web/apiv3/serializers.py` (add UserSetPasswordSerializer)
- Modify: `web/apiv3/views.py` (add 3 small views)
- Modify: `web/apiv3/urls.py` (3 routes)
- Test: `tests/web/test_apiv3_users_simple_mutations.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_users_simple_mutations.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-set", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_set_password(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    resp = c.post(f"/api/v3/users/{t.id}/set-password/",
                  {"password": "ResetPass987Strong!"}, format="json")
    assert resp.status_code == 204
    t.refresh_from_db()
    assert t.check_password("ResetPass987Strong!")


@pytest.mark.django_db
def test_set_password_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="bob")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_set_password").delete()
    c.post(f"/api/v3/users/{t.id}/set-password/",
           {"password": "ResetPass987Strong!"}, format="json")
    assert AuditEvent.objects.filter(action="user_set_password").count() == 1


@pytest.mark.django_db
def test_activate(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=False)
    resp = c.post(f"/api/v3/users/{t.id}/activate/")
    assert resp.status_code == 200
    t.refresh_from_db()
    assert t.is_active is True


@pytest.mark.django_db
def test_deactivate(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=True)
    resp = c.post(f"/api/v3/users/{t.id}/deactivate/")
    assert resp.status_code == 200
    t.refresh_from_db()
    assert t.is_active is False


@pytest.mark.django_db
def test_deactivate_self_400(admin_client):
    c, admin = admin_client
    resp = c.post(f"/api/v3/users/{admin.id}/deactivate/")
    assert resp.status_code == 400
    admin.refresh_from_db()
    assert admin.is_active is True


@pytest.mark.django_db
def test_activate_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice", is_active=False)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_activate").delete()
    c.post(f"/api/v3/users/{t.id}/activate/")
    assert AuditEvent.objects.filter(action="user_activate").count() == 1
```

- [ ] **Step 2: run, expect 6 FAIL**

- [ ] **Step 3: add `UserSetPasswordSerializer` to `web/apiv3/serializers.py`**

```python
class UserSetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value
```

- [ ] **Step 4: add 3 views in `web/apiv3/views.py`**

After `users_detail`:

```python
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_set_password(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(User, pk=user_id)
    serializer = UserSetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user.set_password(serializer.validated_data["password"])
    user.save(update_fields=["password"])
    try:
        from audit_log import helpers as audit
        audit.log("user_set_password", request=request, actor=request.user,
                  target_type="user", target_id=str(user.id), target_label=user.username)
    except Exception:
        pass
    return Response(status=http_status.HTTP_204_NO_CONTENT)


def _users_set_active(request: Request, user_id: int, active: bool, action_key: str) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(User, pk=user_id)
    if not active and user.id == request.user.id:
        return _error("self_deactivate_forbidden", "Cannot deactivate yourself.",
                      http_code=http_status.HTTP_400_BAD_REQUEST)
    if user.is_active != active:
        user.is_active = active
        user.save(update_fields=["is_active"])
    try:
        from audit_log import helpers as audit
        audit.log(action_key, request=request, actor=request.user,
                  target_type="user", target_id=str(user.id), target_label=user.username)
    except Exception:
        pass
    return Response(UserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_activate(request: Request, user_id: int) -> Response:
    return _users_set_active(request, user_id, True, "user_activate")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_deactivate(request: Request, user_id: int) -> Response:
    return _users_set_active(request, user_id, False, "user_deactivate")
```

Add `UserSetPasswordSerializer` to imports.

- [ ] **Step 5: 3 URLs in `web/apiv3/urls.py`**

```python
    path("users/<int:user_id>/set-password/", views.users_set_password, name="users-set-password"),
    path("users/<int:user_id>/activate/", views.users_activate, name="users-activate"),
    path("users/<int:user_id>/deactivate/", views.users_deactivate, name="users-deactivate"),
```

- [ ] **Step 6: rerun, expect 6 PASS**

- [ ] **Step 7: commit**

```bash
git add web/apiv3/serializers.py web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_users_simple_mutations.py
git commit -m "feat(apiv3): /users/<id>/{set-password,activate,deactivate}

3 endpoint sugars. set-password is admin-override (no current_password
required, just AUTH_PASSWORD_VALIDATORS). activate/deactivate just
flip is_active; deactivate-self rejected. All emit audit rows
(user_set_password / user_activate / user_deactivate)."
```

---

### Task B4: bulk-action

**Files:**
- Modify: `web/apiv3/views.py`
- Modify: `web/apiv3/urls.py`
- Test: `tests/web/test_apiv3_users_bulk.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_users_bulk.py
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-blk", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_bulk_activate(admin_client):
    c, _ = admin_client
    a = User.objects.create_user(username="a", is_active=False)
    b = User.objects.create_user(username="b", is_active=False)
    resp = c.post("/api/v3/users/bulk-action/",
                  {"ids": [a.id, b.id], "action": "activate"}, format="json")
    assert resp.status_code == 200
    a.refresh_from_db(); b.refresh_from_db()
    assert a.is_active and b.is_active
    body = resp.json()
    assert set(body["success"]) == {a.id, b.id}
    assert body["failed"] == []


@pytest.mark.django_db
def test_bulk_delete_skips_self(admin_client):
    c, admin = admin_client
    a = User.objects.create_user(username="a")
    resp = c.post("/api/v3/users/bulk-action/",
                  {"ids": [a.id, admin.id], "action": "delete"}, format="json")
    body = resp.json()
    assert a.id in body["success"]
    assert any(f["id"] == admin.id for f in body["failed"])


@pytest.mark.django_db
def test_bulk_unknown_action_400(admin_client):
    c, _ = admin_client
    resp = c.post("/api/v3/users/bulk-action/",
                  {"ids": [1], "action": "explode"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_bulk_audit(admin_client):
    c, _ = admin_client
    a = User.objects.create_user(username="a", is_active=False)
    b = User.objects.create_user(username="b", is_active=False)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_activate").delete()
    c.post("/api/v3/users/bulk-action/",
           {"ids": [a.id, b.id], "action": "activate"}, format="json")
    assert AuditEvent.objects.filter(action="user_activate").count() == 2
```

- [ ] **Step 2: run, expect 4 FAIL**

- [ ] **Step 3: implement view**

In `web/apiv3/views.py` after `users_deactivate`:

```python
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_bulk_action(request: Request) -> Response:
    from django.contrib.auth.models import User
    ids = request.data.get("ids") or []
    action = request.data.get("action")
    if action not in ("activate", "deactivate", "delete"):
        return _error("unknown_action", f"Unknown action: {action}",
                      http_code=http_status.HTTP_400_BAD_REQUEST)
    if not isinstance(ids, list):
        return _error("ids_required", "ids must be a list",
                      http_code=http_status.HTTP_400_BAD_REQUEST)

    success: list[int] = []
    failed: list[dict] = []
    for uid in ids:
        try:
            target = User.objects.get(pk=uid)
        except User.DoesNotExist:
            failed.append({"id": uid, "reason": "not found"})
            continue

        # Apply same per-action constraints as single-user endpoints
        if action == "delete":
            if target.id == request.user.id:
                failed.append({"id": uid, "reason": "cannot delete yourself"})
                continue
            if target.is_superuser and not request.user.is_superuser:
                failed.append({"id": uid, "reason": "only superuser can delete superuser"})
                continue
            target_username = target.username
            target.delete()
            try:
                from audit_log import helpers as audit
                audit.log("user_delete", request=request, actor=request.user,
                          target_type="user", target_id=str(uid), target_label=target_username)
            except Exception:
                pass
            success.append(uid)
        elif action == "activate":
            if not target.is_active:
                target.is_active = True; target.save(update_fields=["is_active"])
            try:
                from audit_log import helpers as audit
                audit.log("user_activate", request=request, actor=request.user,
                          target_type="user", target_id=str(uid), target_label=target.username)
            except Exception:
                pass
            success.append(uid)
        elif action == "deactivate":
            if target.id == request.user.id:
                failed.append({"id": uid, "reason": "cannot deactivate yourself"})
                continue
            if target.is_active:
                target.is_active = False; target.save(update_fields=["is_active"])
            try:
                from audit_log import helpers as audit
                audit.log("user_deactivate", request=request, actor=request.user,
                          target_type="user", target_id=str(uid), target_label=target.username)
            except Exception:
                pass
            success.append(uid)

    return Response({"success": success, "failed": failed})
```

- [ ] **Step 4: register URL**

```python
    path("users/bulk-action/", views.users_bulk_action, name="users-bulk-action"),
```

- [ ] **Step 5: rerun, expect 4 PASS**

- [ ] **Step 6: commit**

```bash
git add web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_users_bulk.py
git commit -m "feat(apiv3): POST /users/bulk-action/ — bulk activate/deactivate/delete

Per-id loop applies same single-user constraints (delete-self / delete-
superuser / deactivate-self). Returns {success: [ids], failed:
[{id, reason}]}. Emits one audit row per successful per-id mutation."
```

---

## Phase C — Groups + Permissions m2m

### Task C1: GET /groups/ + GET /permissions/ + PATCH /users/<id>/groups/ + PATCH /users/<id>/permissions/

**Files:**
- Modify: `web/apiv3/serializers.py` (add GroupSerializer, PermissionSerializer)
- Modify: `web/apiv3/views.py` (add 4 views)
- Modify: `web/apiv3/urls.py` (4 routes)
- Test: `tests/web/test_apiv3_groups_permissions.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_groups_permissions.py
import pytest
from django.contrib.auth.models import Group, Permission, User
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-grp", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_groups_list(admin_client):
    c, _ = admin_client
    Group.objects.create(name="moderators")
    Group.objects.create(name="readers")
    resp = c.get("/api/v3/groups/")
    assert resp.status_code == 200
    names = {g["name"] for g in resp.json()["data"]}
    assert {"moderators", "readers"} <= names


@pytest.mark.django_db
def test_permissions_list(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/permissions/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    sample = body["data"][0]
    assert {"id", "name", "codename", "content_type"} <= set(sample.keys())


@pytest.mark.django_db
def test_permissions_filter_content_type(admin_client):
    c, _ = admin_client
    resp = c.get("/api/v3/permissions/?content_type=auth.user")
    assert resp.status_code == 200
    for p in resp.json()["data"]:
        assert p["content_type"]["app_label"] == "auth"
        assert p["content_type"]["model"] == "user"


@pytest.mark.django_db
def test_set_groups(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    g1 = Group.objects.create(name="g1")
    g2 = Group.objects.create(name="g2")
    resp = c.patch(f"/api/v3/users/{t.id}/groups/",
                   {"group_ids": [g1.id, g2.id]}, format="json")
    assert resp.status_code == 200
    assert set(t.groups.values_list("id", flat=True)) == {g1.id, g2.id}


@pytest.mark.django_db
def test_set_permissions(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    p = Permission.objects.first()
    resp = c.patch(f"/api/v3/users/{t.id}/permissions/",
                   {"permission_ids": [p.id]}, format="json")
    assert resp.status_code == 200
    assert set(t.user_permissions.values_list("id", flat=True)) == {p.id}


@pytest.mark.django_db
def test_set_groups_audit(admin_client):
    c, _ = admin_client
    t = User.objects.create_user(username="alice")
    g = Group.objects.create(name="g")
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="user_update").delete()
    c.patch(f"/api/v3/users/{t.id}/groups/",
            {"group_ids": [g.id]}, format="json")
    events = AuditEvent.objects.filter(action="user_update")
    assert events.count() == 1
    assert events.first().metadata.get("groups_changed") is True
```

- [ ] **Step 2: run, expect 6 FAIL**

- [ ] **Step 3: serializers in `web/apiv3/serializers.py`**

```python
class GroupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    permission_count = serializers.IntegerField()


class PermissionContentTypeSerializer(serializers.Serializer):
    app_label = serializers.CharField()
    model = serializers.CharField()


class PermissionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    codename = serializers.CharField()
    content_type = PermissionContentTypeSerializer()
```

- [ ] **Step 4: 4 views in `web/apiv3/views.py`**

After `users_bulk_action`:

```python
@api_view(["GET"])
@permission_classes([IsAdminUser])
def groups_list(_request: Request) -> Response:
    from django.contrib.auth.models import Group
    rows = Group.objects.annotate(
        permission_count=__import__("django.db.models", fromlist=["Count"]).Count("permissions")
    ).order_by("name")
    return Response({"data": [
        {"id": g.id, "name": g.name, "permission_count": g.permission_count} for g in rows
    ]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def permissions_list(request: Request) -> Response:
    from django.contrib.auth.models import Permission
    qs = Permission.objects.select_related("content_type").order_by(
        "content_type__app_label", "content_type__model", "codename"
    )
    ctf = request.query_params.get("content_type")
    if ctf:
        if "." in ctf:
            app, model = ctf.split(".", 1)
            qs = qs.filter(content_type__app_label=app, content_type__model=model)
    rows = list(qs)
    return Response({"data": [
        {
            "id": p.id, "name": p.name, "codename": p.codename,
            "content_type": {
                "app_label": p.content_type.app_label,
                "model": p.content_type.model,
            },
        } for p in rows
    ]})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def users_set_groups(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import Group, User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(User, pk=user_id)
    ids = request.data.get("group_ids") or []
    if not isinstance(ids, list):
        return _error("group_ids_required", "group_ids must be a list",
                      http_code=http_status.HTTP_400_BAD_REQUEST)
    valid = list(Group.objects.filter(id__in=ids).values_list("id", flat=True))
    user.groups.set(valid)
    try:
        from audit_log import helpers as audit
        audit.log("user_update", request=request, actor=request.user,
                  target_type="user", target_id=str(user.id),
                  target_label=user.username, groups_changed=True)
    except Exception:
        pass
    user.refresh_from_db()
    return Response(UserSerializer(user).data)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def users_set_permissions(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import Permission, User
    from django.shortcuts import get_object_or_404
    user = get_object_or_404(User, pk=user_id)
    ids = request.data.get("permission_ids") or []
    if not isinstance(ids, list):
        return _error("permission_ids_required", "permission_ids must be a list",
                      http_code=http_status.HTTP_400_BAD_REQUEST)
    valid = list(Permission.objects.filter(id__in=ids).values_list("id", flat=True))
    user.user_permissions.set(valid)
    try:
        from audit_log import helpers as audit
        audit.log("user_update", request=request, actor=request.user,
                  target_type="user", target_id=str(user.id),
                  target_label=user.username, permissions_changed=True)
    except Exception:
        pass
    user.refresh_from_db()
    return Response(UserSerializer(user).data)
```

- [ ] **Step 5: 4 URLs**

```python
    path("groups/", views.groups_list, name="groups-list"),
    path("permissions/", views.permissions_list, name="permissions-list"),
    path("users/<int:user_id>/groups/", views.users_set_groups, name="users-set-groups"),
    path("users/<int:user_id>/permissions/", views.users_set_permissions, name="users-set-permissions"),
```

- [ ] **Step 6: rerun, expect 6 PASS**

- [ ] **Step 7: commit**

```bash
git add web/apiv3/serializers.py web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_groups_permissions.py
git commit -m "feat(apiv3): groups + permissions list endpoints + m2m PATCH

GET /groups/ — list with permission_count
GET /permissions/ — list, optional ?content_type=app.model filter
PATCH /users/<id>/groups/ — replace m2m via set()
PATCH /users/<id>/permissions/ — same pattern for user_permissions

m2m mutations emit user_update audit row with metadata flag
groups_changed / permissions_changed (replaces fields list shape
since per-row diff is impractical for m2m)."
```

---

## Phase D — API Token endpoints

### Task D1: /me/token/ + /users/<id>/token/

**Files:**
- Modify: `web/apiv3/serializers.py` (add TokenSerializer)
- Modify: `web/apiv3/views.py` (add 2 view dispatchers — me + admin)
- Modify: `web/apiv3/urls.py` (2 routes; methods on each)
- Test: `tests/web/test_apiv3_token.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_apiv3_token.py
import pytest
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient


@pytest.fixture
def admin_client():
    a = User.objects.create_user(username="adm-tok", password="x", is_staff=True)
    c = APIClient(); c.force_authenticate(user=a)
    return c, a


@pytest.fixture
def regular_client():
    u = User.objects.create_user(username="reg-tok", password="x")
    c = APIClient(); c.force_authenticate(user=u)
    return c, u


@pytest.mark.django_db
def test_me_token_get_empty(regular_client):
    c, _ = regular_client
    resp = c.get("/api/v3/me/token/")
    assert resp.status_code == 200
    assert resp.json()["key"] is None


@pytest.mark.django_db
def test_me_token_post_creates(regular_client):
    c, u = regular_client
    resp = c.post("/api/v3/me/token/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["key"]
    assert Token.objects.filter(user=u).exists()


@pytest.mark.django_db
def test_me_token_post_rotates(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    old = Token.objects.get(user=u).key
    resp = c.post("/api/v3/me/token/")
    new = resp.json()["key"]
    assert new != old
    # Only one token left after rotate.
    assert Token.objects.filter(user=u).count() == 1


@pytest.mark.django_db
def test_me_token_delete(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    resp = c.delete("/api/v3/me/token/")
    assert resp.status_code == 204
    assert not Token.objects.filter(user=u).exists()


@pytest.mark.django_db
def test_admin_token_get(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="t1")
    Token.objects.create(user=target)
    resp = c.get(f"/api/v3/users/{target.id}/token/")
    assert resp.status_code == 200
    assert resp.json()["key"]


@pytest.mark.django_db
def test_admin_token_post_rotates(admin_client):
    c, _ = admin_client
    target = User.objects.create_user(username="t2")
    Token.objects.create(user=target)
    resp = c.post(f"/api/v3/users/{target.id}/token/")
    assert resp.status_code == 200
    assert resp.json()["key"] != ""


@pytest.mark.django_db
def test_admin_token_get_rejects_non_staff():
    user = User.objects.create_user(username="reg")
    c = APIClient(); c.force_authenticate(user=user)
    target = User.objects.create_user(username="other")
    assert c.get(f"/api/v3/users/{target.id}/token/").status_code == 403


@pytest.mark.django_db
def test_token_audit_create(regular_client):
    c, _ = regular_client
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action__in=("token_create", "token_rotate")).delete()
    c.post("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_create").count() == 1


@pytest.mark.django_db
def test_token_audit_rotate(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="token_rotate").delete()
    c.post("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_rotate").count() == 1


@pytest.mark.django_db
def test_token_audit_revoke(regular_client):
    c, u = regular_client
    Token.objects.create(user=u)
    from audit_log.models import AuditEvent
    AuditEvent.objects.filter(action="token_revoke").delete()
    c.delete("/api/v3/me/token/")
    assert AuditEvent.objects.filter(action="token_revoke").count() == 1
```

- [ ] **Step 2: run, expect 10 FAIL**

- [ ] **Step 3: implement TokenSerializer in `web/apiv3/serializers.py`**

```python
class TokenSerializer(serializers.Serializer):
    key = serializers.CharField(allow_null=True)
    created = serializers.DateTimeField(allow_null=True)
```

- [ ] **Step 4: implement views in `web/apiv3/views.py`**

After permissions/groups endpoints:

```python
def _token_payload(token):
    if not token:
        return {"key": None, "created": None}
    return {"key": token.key, "created": token.created}


def _handle_token(request: Request, target_user) -> Response:
    from rest_framework.authtoken.models import Token
    if request.method == "GET":
        try:
            tok = Token.objects.get(user=target_user)
        except Token.DoesNotExist:
            tok = None
        return Response(_token_payload(tok))

    if request.method == "POST":
        existing = Token.objects.filter(user=target_user).first()
        rotated = existing is not None
        if existing:
            existing.delete()
        new_tok = Token.objects.create(user=target_user)
        try:
            from audit_log import helpers as audit
            audit.log(
                "token_rotate" if rotated else "token_create",
                request=request, actor=request.user,
                target_type="user", target_id=str(target_user.id),
                target_label=target_user.username,
            )
        except Exception:
            pass
        return Response(_token_payload(new_tok))

    if request.method == "DELETE":
        deleted, _ = Token.objects.filter(user=target_user).delete()
        if deleted:
            try:
                from audit_log import helpers as audit
                audit.log("token_revoke", request=request, actor=request.user,
                          target_type="user", target_id=str(target_user.id),
                          target_label=target_user.username)
            except Exception:
                pass
        return Response(status=http_status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def me_token(request: Request) -> Response:
    return _handle_token(request, request.user)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminUser])
def users_token(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404
    target = get_object_or_404(User, pk=user_id)
    return _handle_token(request, target)
```

- [ ] **Step 5: register URLs**

```python
    path("me/token/", views.me_token, name="me-token"),
    path("users/<int:user_id>/token/", views.users_token, name="users-token"),
```

- [ ] **Step 6: rerun, expect 10 PASS**

- [ ] **Step 7: commit**

```bash
git add web/apiv3/serializers.py web/apiv3/views.py web/apiv3/urls.py tests/web/test_apiv3_token.py
git commit -m "feat(apiv3): API token endpoints — /me/token/ + /users/<id>/token/

Both expose GET (read), POST (create-or-rotate), DELETE (revoke).
DRF default 1-token-per-user model — POST atomically deletes any
existing token and creates a new one (rotate semantics). Audit
emits token_create on first creation, token_rotate on replacement,
token_revoke on delete."
```

---

## Phase E — backend final integration check

### Task E1: smoke entire backend on 192.168.1.6

**Files:** none modified. Operational only.

- [ ] **Step 1: deploy backend**

```bash
cd /Users/lamba/github/cape

sshpass -p ubuntu rsync -av --delete -e "ssh -o StrictHostKeyChecking=no" \
  --exclude=__pycache__ --exclude=siteauth.sqlite --exclude=migrations/__pycache__ \
  --exclude=static/spa \
  web/ ubuntu@192.168.1.6:/tmp/cape-web/ 2>&1 | tail -3

sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S rsync -av --delete --exclude=__pycache__ --exclude=siteauth.sqlite --exclude=static/spa /tmp/cape-web/ /opt/CAPEv2/web/ \
   && echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web' 2>&1 | tail -3

sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py check 2>&1 | tail -3'
```

Expected: only the pre-existing deprecation warning.

- [ ] **Step 2: full pytest run**

```bash
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/test_audit_log_user_actions.py tests/web/test_apiv3_user_serializers.py tests/web/test_apiv3_users_list.py tests/web/test_apiv3_users_detail.py tests/web/test_apiv3_users_create.py tests/web/test_apiv3_users_update.py tests/web/test_apiv3_users_delete.py tests/web/test_apiv3_users_simple_mutations.py tests/web/test_apiv3_users_bulk.py tests/web/test_apiv3_groups_permissions.py tests/web/test_apiv3_token.py -v 2>&1 | tail -15'
```

Expected: all green.

- [ ] **Step 3: restart cape-web + curl smoke**

```bash
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S systemctl restart cape-web' && sleep 4

TOKEN=$(sshpass -p ubuntu ssh ubuntu@192.168.1.6 "cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -c \"
import django, os
os.environ['DJANGO_SETTINGS_MODULE']='web.settings'
django.setup()
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
u=get_user_model().objects.filter(is_staff=True).first()
t,_=Token.objects.get_or_create(user=u)
print(t.key)
\"" | tr -d '\r\n')

echo "token = $TOKEN"

# Anonymous probes
curl -s -o /dev/null -w "/api/v3/users/ (no token) → %{http_code}\n" http://192.168.1.6:8000/api/v3/users/

# Authed probes
curl -s -H "Authorization: Token $TOKEN" -o /tmp/r.json -w "/api/v3/users/?limit=3 → %{http_code}\n" http://192.168.1.6:8000/api/v3/users/?limit=3
python3 -c "import json; d=json.load(open('/tmp/r.json')); print(f'  total={d[\"total\"]} returned={len(d[\"data\"])}')"
curl -s -H "Authorization: Token $TOKEN" -o /tmp/r.json -w "/api/v3/groups/ → %{http_code}\n" http://192.168.1.6:8000/api/v3/groups/
curl -s -H "Authorization: Token $TOKEN" -o /tmp/r.json -w "/api/v3/permissions/?content_type=auth.user → %{http_code}\n" "http://192.168.1.6:8000/api/v3/permissions/?content_type=auth.user"
curl -s -H "Authorization: Token $TOKEN" -o /tmp/r.json -w "/api/v3/me/token/ → %{http_code}\n" http://192.168.1.6:8000/api/v3/me/token/
```

Expected: 401 for anonymous, 200 for authed, valid JSON shapes.

- [ ] **Step 4: no commit**

Backend is now feature-complete. Ready for frontend.

---

## Phase F — SPA infrastructure

### Task F1: API clients + query keys + hooks

**Files:**
- Create: `frontend/app/src/lib/api/users.ts`
- Create: `frontend/app/src/lib/api/groups.ts`
- Create: `frontend/app/src/lib/api/permissions.ts`
- Create: `frontend/app/src/lib/api/tokens.ts`
- Modify: `frontend/app/src/lib/query-keys.ts` (add users/groups/permissions/tokens)

- [ ] **Step 1: implement `frontend/app/src/lib/api/users.ts`**

```typescript
import { apiClient } from "./client";

export interface UserListRow {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  group_count: number;
  has_token: boolean;
  subscription: string | null;
}

export interface UserDetail extends Omit<UserListRow, "group_count" | "subscription"> {
  group_ids: number[];
  permission_ids: number[];
  userprofile: { subscription: string; reports: boolean } | null;
}

export interface UserListFilters {
  search?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  group?: string;
  cursor?: number;
  limit?: number;
  ordering?: string;
}

export interface UserListResponse {
  data: UserListRow[];
  next_cursor: number | null;
  total: number;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
}

export interface UserUpdatePayload {
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  userprofile?: { subscription?: string; reports?: boolean };
}

export interface BulkActionPayload {
  ids: number[];
  action: "activate" | "deactivate" | "delete";
}

export interface BulkActionResponse {
  success: number[];
  failed: { id: number; reason: string }[];
}

export async function listUsers(filters: UserListFilters = {}): Promise<UserListResponse> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    params[k] = String(v);
  }
  const { data } = await apiClient.get<UserListResponse>("/users/", { params });
  return data;
}

export async function getUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.get<UserDetail>(`/users/${id}/`);
  return data;
}

export async function createUser(payload: UserCreatePayload): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>("/users/", payload);
  return data;
}

export async function updateUser(id: number, payload: UserUpdatePayload): Promise<UserDetail> {
  const { data } = await apiClient.patch<UserDetail>(`/users/${id}/`, payload);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}/`);
}

export async function setUserPassword(id: number, password: string): Promise<void> {
  await apiClient.post(`/users/${id}/set-password/`, { password });
}

export async function activateUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>(`/users/${id}/activate/`);
  return data;
}

export async function deactivateUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>(`/users/${id}/deactivate/`);
  return data;
}

export async function bulkAction(payload: BulkActionPayload): Promise<BulkActionResponse> {
  const { data } = await apiClient.post<BulkActionResponse>("/users/bulk-action/", payload);
  return data;
}

export async function setUserGroups(id: number, group_ids: number[]): Promise<UserDetail> {
  const { data } = await apiClient.patch<UserDetail>(`/users/${id}/groups/`, { group_ids });
  return data;
}

export async function setUserPermissions(id: number, permission_ids: number[]): Promise<UserDetail> {
  const { data } = await apiClient.patch<UserDetail>(`/users/${id}/permissions/`, { permission_ids });
  return data;
}
```

- [ ] **Step 2: implement `frontend/app/src/lib/api/groups.ts`**

```typescript
import { apiClient } from "./client";

export interface Group {
  id: number;
  name: string;
  permission_count: number;
}

export async function listGroups(): Promise<Group[]> {
  const { data } = await apiClient.get<{ data: Group[] }>("/groups/");
  return data.data;
}
```

- [ ] **Step 3: implement `frontend/app/src/lib/api/permissions.ts`**

```typescript
import { apiClient } from "./client";

export interface PermissionContentType {
  app_label: string;
  model: string;
}

export interface Permission {
  id: number;
  name: string;
  codename: string;
  content_type: PermissionContentType;
}

export async function listPermissions(contentType?: string): Promise<Permission[]> {
  const params = contentType ? { content_type: contentType } : undefined;
  const { data } = await apiClient.get<{ data: Permission[] }>("/permissions/", { params });
  return data.data;
}
```

- [ ] **Step 4: implement `frontend/app/src/lib/api/tokens.ts`**

```typescript
import { apiClient } from "./client";

export interface TokenInfo {
  key: string | null;
  created: string | null;
}

export async function getMyToken(): Promise<TokenInfo> {
  const { data } = await apiClient.get<TokenInfo>("/me/token/");
  return data;
}

export async function rotateMyToken(): Promise<TokenInfo> {
  const { data } = await apiClient.post<TokenInfo>("/me/token/");
  return data;
}

export async function revokeMyToken(): Promise<void> {
  await apiClient.delete("/me/token/");
}

export async function getUserToken(userId: number): Promise<TokenInfo> {
  const { data } = await apiClient.get<TokenInfo>(`/users/${userId}/token/`);
  return data;
}

export async function rotateUserToken(userId: number): Promise<TokenInfo> {
  const { data } = await apiClient.post<TokenInfo>(`/users/${userId}/token/`);
  return data;
}

export async function revokeUserToken(userId: number): Promise<void> {
  await apiClient.delete(`/users/${userId}/token/`);
}
```

- [ ] **Step 5: extend `frontend/app/src/lib/query-keys.ts`**

Add to the existing `queryKeys` object:

```typescript
import type { UserListFilters } from "@/lib/api/users";

// inside queryKeys object:
  users: {
    all: ["users"] as const,
    list: (filters: UserListFilters) => ["users", "list", filters] as const,
    detail: (id: number) => ["users", "detail", id] as const,
  },
  groups: {
    all: ["groups"] as const,
    list: ["groups", "list"] as const,
  },
  permissions: {
    all: ["permissions"] as const,
    list: (contentType?: string) => ["permissions", "list", contentType ?? null] as const,
  },
  tokens: {
    me: ["tokens", "me"] as const,
    user: (id: number) => ["tokens", "user", id] as const,
  },
```

- [ ] **Step 6: typecheck**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 7: commit**

```bash
git add frontend/app/src/lib/api/users.ts frontend/app/src/lib/api/groups.ts frontend/app/src/lib/api/permissions.ts frontend/app/src/lib/api/tokens.ts frontend/app/src/lib/query-keys.ts
git commit -m "feat(api): users/groups/permissions/tokens API clients + query keys

13 user endpoints + 1 groups + 1 permissions + 6 token endpoints
wrapped as typed promises; query keys for tanstack-query cache."
```

---

### Task F2: UserListPage + filter + table

**Files:**
- Create: `frontend/app/src/hooks/useUsers.ts`
- Create: `frontend/app/src/components/users/UserFilterBar.tsx`
- Create: `frontend/app/src/components/users/UserListTable.tsx`
- Create: `frontend/app/src/routes/users.tsx`
- Modify: `frontend/app/src/router.tsx` (register `/users` route)

- [ ] **Step 1: implement `frontend/app/src/hooks/useUsers.ts`**

```typescript
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getUser, listUsers, type UserListFilters } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

export function useUsersInfinite(filters: UserListFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listUsers({ ...filters, cursor: pageParam, limit: filters.limit ?? 20 }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useUserDetail(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? 0),
    queryFn: () => getUser(id!),
    enabled: id !== undefined && id > 0,
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: implement `UserFilterBar.tsx` + `UserListTable.tsx` + `users.tsx`**

(Source bodies: see plan §6.2 mockup. Implementation pattern follows audit-log spec's filter bar + table approach.)

`UserFilterBar.tsx`:

```tsx
import { useState } from "react";

import type { UserListFilters } from "@/lib/api/users";

interface Props {
  initial: UserListFilters;
  onApply: (next: UserListFilters) => void;
}

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)",
  color: "var(--color-fg-0)",
  borderRadius: 3,
  minWidth: 80,
};

const tribool = ["", "true", "false"] as const;

export function UserFilterBar({ initial, onApply }: Props) {
  const [search, setSearch] = useState(initial.search ?? "");
  const [isStaff, setIsStaff] = useState<string>(
    initial.is_staff === undefined ? "" : initial.is_staff ? "true" : "false",
  );
  const [isActive, setIsActive] = useState<string>(
    initial.is_active === undefined ? "" : initial.is_active ? "true" : "false",
  );
  const [group, setGroup] = useState(initial.group ?? "");
  const [ordering, setOrdering] = useState(initial.ordering ?? "-date_joined");

  function clear() {
    setSearch(""); setIsStaff(""); setIsActive(""); setGroup(""); setOrdering("-date_joined");
    onApply({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onApply({
      search: search || undefined,
      is_staff: isStaff === "" ? undefined : isStaff === "true",
      is_active: isActive === "" ? undefined : isActive === "true",
      group: group || undefined,
      ordering,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <input style={{ ...inputStyle, minWidth: 200 }} placeholder="Search username/email/name…"
             value={search} onChange={(e) => setSearch(e.target.value)} />
      <select style={inputStyle} value={isStaff} onChange={(e) => setIsStaff(e.target.value)}>
        <option value="">staff: any</option>
        <option value="true">is_staff</option>
        <option value="false">not staff</option>
      </select>
      <select style={inputStyle} value={isActive} onChange={(e) => setIsActive(e.target.value)}>
        <option value="">active: any</option>
        <option value="true">active</option>
        <option value="false">inactive</option>
      </select>
      <input style={inputStyle} placeholder="group" value={group} onChange={(e) => setGroup(e.target.value)} />
      <select style={inputStyle} value={ordering} onChange={(e) => setOrdering(e.target.value)}>
        <option value="-date_joined">newest</option>
        <option value="date_joined">oldest</option>
        <option value="username">username ↑</option>
        <option value="-username">username ↓</option>
        <option value="-last_login">last login ↓</option>
        <option value="last_login">last login ↑</option>
      </select>
      <button type="submit" className="btn primary" style={{ height: 28, fontSize: 11.5 }}>Apply</button>
      <button type="button" className="btn" onClick={clear} style={{ height: 28, fontSize: 11.5 }}>Clear</button>
    </form>
  );
}
```

`UserListTable.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { UserListRow } from "@/lib/api/users";

interface Props {
  rows: UserListRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function UserListTable({ rows, selected, onToggle, onToggleAll }: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <table className="data" style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 28 }}>
            <input type="checkbox" checked={allChecked}
                   onChange={(e) => onToggleAll(e.target.checked)} />
          </th>
          <th>Username</th>
          <th>Email</th>
          <th style={{ width: 60 }}>Staff</th>
          <th style={{ width: 60 }}>Active</th>
          <th style={{ width: 140 }}>Last login</th>
          <th style={{ width: 80 }}>Groups</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <input type="checkbox" checked={selected.has(r.id)}
                     onChange={() => onToggle(r.id)} />
            </td>
            <td className="mono"><Link to={`/users/${r.id}`}>{r.username}</Link></td>
            <td className="dim mono" style={{ fontSize: 11 }}>{r.email || "—"}</td>
            <td>{r.is_staff ? "✓" : ""}</td>
            <td>{r.is_active ? "✓" : <span className="dim">⊘</span>}</td>
            <td className="dim mono" style={{ fontSize: 10.5 }}>{r.last_login ?? "—"}</td>
            <td className="dim">{r.group_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`routes/users.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHead } from "@/components/shared/PageHead";
import { Centered } from "@/components/shared/Centered";
import { Spinner } from "@/components/ui/spinner";
import { UserFilterBar } from "@/components/users/UserFilterBar";
import { UserListTable } from "@/components/users/UserListTable";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUsersInfinite } from "@/hooks/useUsers";
import type { UserListFilters } from "@/lib/api/users";

function filtersFromSearch(sp: URLSearchParams): UserListFilters {
  const f: UserListFilters = {};
  const s = sp.get("search"); if (s) f.search = s;
  const ist = sp.get("is_staff"); if (ist) f.is_staff = ist === "true";
  const isa = sp.get("is_active"); if (isa) f.is_active = isa === "true";
  const g = sp.get("group"); if (g) f.group = g;
  const o = sp.get("ordering"); if (o) f.ordering = o;
  return f;
}

function searchFromFilters(f: UserListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("search", f.search);
  if (f.is_staff !== undefined) sp.set("is_staff", String(f.is_staff));
  if (f.is_active !== undefined) sp.set("is_active", String(f.is_active));
  if (f.group) sp.set("group", f.group);
  if (f.ordering) sp.set("ordering", f.ordering);
  return sp;
}

export default function UsersRoute() {
  const me = useCurrentUser();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const q = useUsersInfinite(filters);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (me.isLoading) return <Centered><Spinner size={14} /></Centered>;
  if (!me.data?.is_staff) {
    return (
      <Centered>
        <Alert variant="destructive">
          <AlertTitle>Admin privileges required</AlertTitle>
          <AlertDescription>The /users page is restricted to is_staff accounts.</AlertDescription>
        </Alert>
      </Centered>
    );
  }

  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users"]}
                actions={
                  <Link to="/users/new" className="btn primary"
                        style={{ height: 28, padding: "0 12px", fontSize: 12 }}>+ Add user</Link>
                } />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div className="panel-h">
            Users <span className="count">· {rows.length} loaded / {total} total</span>
          </div>
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            <UserFilterBar initial={filters} onApply={(next) => {
              setSp(searchFromFilters(next));
              setSelected(new Set());
            }} />
            {q.isLoading ? (
              <Centered><Spinner size={14} /></Centered>
            ) : (
              <UserListTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
            )}
            {q.hasNextPage && (
              <button className="btn" onClick={() => q.fetchNextPage()}
                      disabled={q.isFetchingNextPage}
                      style={{ alignSelf: "flex-start" }}>
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

If `Centered` / `PageHead` / `Spinner` / `Alert` don't exist in the codebase, copy patterns from the audit page (`frontend/app/src/routes/audit.tsx`). They've been used before.

- [ ] **Step 3: register route in `frontend/app/src/router.tsx`**

```tsx
const UsersRoute = lazy(() => import("@/routes/users"));
// inside children of "/":
{ path: "users", element: withSuspense(<UsersRoute />) },
```

- [ ] **Step 4: typecheck + build**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: commit**

```bash
git add frontend/app/src/hooks/useUsers.ts frontend/app/src/components/users/ frontend/app/src/routes/users.tsx frontend/app/src/router.tsx
git commit -m "feat(spa): /users list page with filter bar + selection checkboxes

UserFilterBar (search/is_staff/is_active/group/ordering) → URL params.
UserListTable with Link to detail. Cursor-based Load more pagination.
StaffOnly gate via useCurrentUser. Selection state for upcoming
BulkActionBar (next task)."
```

---

### Task F3: BulkActionBar

**Files:**
- Create: `frontend/app/src/components/users/BulkActionBar.tsx`
- Modify: `frontend/app/src/routes/users.tsx` (mount the bar)

- [ ] **Step 1: implement `BulkActionBar.tsx`**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { bulkAction, type BulkActionResponse } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  selected: Set<number>;
  usernames: Map<number, string>;
  onClear: () => void;
}

export function BulkActionBar({ selected, usernames, onClear }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: bulkAction,
    onSuccess: (r: BulkActionResponse) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      const ok = r.success.length;
      const fail = r.failed.length;
      showToast(`${ok} succeeded${fail ? `, ${fail} failed` : ""}.`,
                fail ? "info" : "success");
      onClear();
    },
    onError: () => showToast("Bulk action failed.", "error"),
  });

  if (selected.size === 0) return null;

  function run(action: "activate" | "deactivate" | "delete") {
    const ids = Array.from(selected);
    if (action === "delete") {
      const names = ids.map((i) => usernames.get(i) ?? `#${i}`).join(", ");
      if (!window.confirm(`Delete ${ids.length} users: ${names}?\n\nThis cannot be undone.`)) return;
    }
    m.mutate({ ids, action });
  }

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "center",
      padding: "8px 12px",
      background: "var(--color-bg-2)",
      border: "1px solid var(--color-border)",
      borderRadius: 4,
    }}>
      <span className="dim" style={{ fontSize: 12 }}>{selected.size} selected</span>
      <div style={{ flex: 1 }} />
      <button className="btn" onClick={() => run("activate")} disabled={m.isPending}>Activate</button>
      <button className="btn" onClick={() => run("deactivate")} disabled={m.isPending}>Deactivate</button>
      <button className="btn danger" onClick={() => run("delete")} disabled={m.isPending}>Delete</button>
      <button className="btn ghost" onClick={onClear}>Clear</button>
    </div>
  );
}
```

- [ ] **Step 2: mount in `routes/users.tsx`**

In the page body, after the filter bar and before the table, add:

```tsx
<BulkActionBar
  selected={selected}
  usernames={new Map(rows.map((r) => [r.id, r.username]))}
  onClear={() => setSelected(new Set())}
/>
```

Add `import { BulkActionBar } from "@/components/users/BulkActionBar";`.

- [ ] **Step 3: typecheck + build + commit**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
git add frontend/app/src/components/users/BulkActionBar.tsx frontend/app/src/routes/users.tsx
git commit -m "feat(spa): BulkActionBar in /users — activate/deactivate/delete (with confirm)"
```

---

## Phase G — UserDetailPage shell + Basic + Profile tabs

### Task G1: UserDetailPage shell with empty tabs + routing

**Files:**
- Create: `frontend/app/src/routes/users-detail.tsx`
- Modify: `frontend/app/src/router.tsx` (register `/users/:id`)

- [ ] **Step 1: implement detail-page skeleton**

```tsx
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { Centered } from "@/components/shared/Centered";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDetail } from "@/hooks/useUsers";

const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile"] as const;
type TabKey = (typeof TABS)[number];

export default function UsersDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const userQ = useUserDetail(id);
  const [tab, setTab] = useState<TabKey>("Basic");

  if (me.isLoading || userQ.isLoading) return <Centered><Spinner size={14} /></Centered>;
  if (!me.data?.is_staff) {
    navigate("/", { replace: true });
    return null;
  }
  if (userQ.error || !userQ.data) {
    return (
      <Centered>
        <div className="dim">User not found.</div>
      </Centered>
    );
  }

  const user = userQ.data;

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", user.username]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div style={{
            padding: "0 14px", borderBottom: "1px solid var(--color-border)",
            display: "flex", gap: 4,
          }}>
            {TABS.map((t) => (
              <button key={t}
                      onClick={() => setTab(t)}
                      style={{
                        background: "transparent", border: 0,
                        borderBottom: tab === t ? "2px solid var(--color-accent-strong)" : "2px solid transparent",
                        padding: "10px 12px", fontSize: 12,
                        color: tab === t ? "var(--color-fg-0)" : "var(--color-fg-2)",
                        cursor: "pointer",
                      }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {tab === "Basic" && <BasicTab user={user} />}
            {tab === "Groups" && <Placeholder name="Groups" />}
            {tab === "Permissions" && <Placeholder name="Permissions" />}
            {tab === "API Token" && <Placeholder name="API Token" />}
            {tab === "Profile" && <Placeholder name="Profile" />}
          </div>
        </div>
      </div>
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return <div className="dim mono">[{name} tab — implemented in subsequent task]</div>;
}

// BasicTab is implemented inline here in the next task; for now stub:
function BasicTab({ user }: { user: import("@/lib/api/users").UserDetail }) {
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <div><strong>Username:</strong> {user.username}</div>
      <div><strong>Email:</strong> {user.email || "—"}</div>
      <div><strong>is_staff:</strong> {String(user.is_staff)}</div>
      <div><strong>is_superuser:</strong> {String(user.is_superuser)}</div>
      <div><strong>is_active:</strong> {String(user.is_active)}</div>
    </div>
  );
}
```

- [ ] **Step 2: register route in `router.tsx`**

```tsx
const UsersDetailRoute = lazy(() => import("@/routes/users-detail"));
// children of "/":
{ path: "users/:id", element: withSuspense(<UsersDetailRoute />) },
```

- [ ] **Step 3: typecheck + build + commit**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
git add frontend/app/src/routes/users-detail.tsx frontend/app/src/router.tsx
git commit -m "feat(spa): /users/<id> detail page shell with 5 empty tabs"
```

---

### Task G2: Basic + Profile tabs (full editing) + SetPasswordModal

**Files:**
- Modify: `frontend/app/src/routes/users-detail.tsx` (replace stub BasicTab; add ProfileTab)
- Create: `frontend/app/src/components/users/SetPasswordModal.tsx`

- [ ] **Step 1: implement `SetPasswordModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { setUserPassword } from "@/lib/api/users";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  username: string;
}

export function SetPasswordModal({ open, onOpenChange, userId, username }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) { setPassword(""); setConfirm(""); setErr(null); }
  }, [open]);

  const m = useMutation({
    mutationFn: () => setUserPassword(userId, password),
    onSuccess: () => {
      showToast(`Password reset for ${username}.`, "success");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (typeof data === "object" && data && "password" in data) {
        setErr(String((data as { password: string[] }).password.join(" ")));
      } else {
        setErr("Could not reset password. Please try again.");
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setErr(null);
    m.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Set password for {username}</DialogTitle></DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }} htmlFor="pw1">New password</label>
              <input id="pw1" type="password" autoComplete="new-password"
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     style={inputStyle} required />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }} htmlFor="pw2">Confirm</label>
              <input id="pw2" type="password" autoComplete="new-password"
                     value={confirm} onChange={(e) => setConfirm(e.target.value)}
                     style={inputStyle} required />
            </div>
            {err && <div style={{ fontSize: 11, color: "var(--color-sev-crit, #ff7b72)" }}>{err}</div>}
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={m.isPending}>
              {m.isPending ? "Setting…" : "Set password"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)",
  borderRadius: 3,
};
```

- [ ] **Step 2: replace `BasicTab` + add `ProfileTab` + delete buttons in `users-detail.tsx`**

In `routes/users-detail.tsx`:

```tsx
// Replace the stub BasicTab. Full version:

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { SetPasswordModal } from "@/components/users/SetPasswordModal";
import { deleteUser, updateUser } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/components/shared/Toast";

function BasicTab({ user }: { user: import("@/lib/api/users").UserDetail }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [pwOpen, setPwOpen] = useState(false);

  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [isStaff, setIsStaff] = useState(user.is_staff);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isSuper, setIsSuper] = useState(user.is_superuser);

  const meIsSuper = me.data?.is_superuser ?? false;
  const isSelf = me.data?.username === user.username;

  const update = useMutation({
    mutationFn: () => updateUser(user.id, {
      email, first_name: firstName, last_name: lastName,
      is_staff: isStaff, is_active: isActive,
      ...(meIsSuper ? { is_superuser: isSuper } : {}),
    }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("User updated.", "success");
    },
    onError: () => showToast("Update failed.", "error"),
  });

  const del = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast(`Deleted ${user.username}.`, "success");
      navigate("/users");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error_value?: string } } })?.response?.data?.error_value;
      showToast(msg ?? "Delete failed.", "error");
    },
  });

  function confirmDelete() {
    if (!window.confirm(`Delete user ${user.username}? This cannot be undone.`)) return;
    del.mutate();
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <Field label="Username (read-only)"><input readOnly value={user.username} style={inputStyleRO} /></Field>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
      <Field label="First name"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} /></Field>
      <Field label="Last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} /></Field>
      <Toggle label="Staff" checked={isStaff} onChange={setIsStaff} />
      <Toggle label="Active" checked={isActive} onChange={setIsActive} disabled={isSelf} />
      {meIsSuper && <Toggle label="Superuser" checked={isSuper} onChange={setIsSuper} />}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn primary" onClick={() => update.mutate()} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button className="btn" onClick={() => setPwOpen(true)}>Set password</button>
        <div style={{ flex: 1 }} />
        <button className="btn danger" onClick={confirmDelete} disabled={isSelf || del.isPending}>
          {del.isPending ? "Deleting…" : "Delete user"}
        </button>
      </div>

      <SetPasswordModal open={pwOpen} onOpenChange={setPwOpen} userId={user.id} username={user.username} />
    </div>
  );
}

function ProfileTab({ user }: { user: import("@/lib/api/users").UserDetail }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [sub, setSub] = useState(user.userprofile?.subscription ?? "");
  const [reports, setReports] = useState(user.userprofile?.reports ?? false);

  const m = useMutation({
    mutationFn: () => updateUser(user.id, { userprofile: { subscription: sub, reports } }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Profile saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480, fontSize: 12 }}>
      <Field label="Subscription"><input value={sub} onChange={(e) => setSub(e.target.value)} style={inputStyle} /></Field>
      <Toggle label="Reports allowed" checked={reports} onChange={setReports} />
      <div className="dim" style={{ fontSize: 11 }}>
        Last login: {user.last_login ?? "never"} · Joined: {user.date_joined}
      </div>
      <button className="btn primary" onClick={() => m.mutate()} disabled={m.isPending} style={{ alignSelf: "flex-start" }}>
        {m.isPending ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)", borderRadius: 3,
};
const inputStyleRO: React.CSSProperties = { ...inputStyle, opacity: 0.6, cursor: "not-allowed" };
```

In the route's tab-switch JSX, replace `{tab === "Profile" && <Placeholder name="Profile" />}` with `{tab === "Profile" && <ProfileTab user={user} />}`.

- [ ] **Step 3: typecheck + build + commit**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
git add frontend/app/src/components/users/SetPasswordModal.tsx frontend/app/src/routes/users-detail.tsx
git commit -m "feat(spa): UserDetailPage Basic + Profile tabs + SetPasswordModal

Basic tab: editable email/first_name/last_name + is_staff/is_active
toggles + is_superuser (only superuser sees toggle) + Set password
button + Delete (disabled when target == self).
Profile tab: subscription + reports + readonly date_joined/last_login.
SetPasswordModal: 2-input form, client preflight (length + match)."
```

---

## Phase H — Groups + Permissions tabs

### Task H1: Groups tab + GroupsPicker

**Files:**
- Create: `frontend/app/src/components/users/GroupsPicker.tsx`
- Modify: `frontend/app/src/routes/users-detail.tsx` (replace Placeholder for Groups)

- [ ] **Step 1: implement `GroupsPicker.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { listGroups } from "@/lib/api/groups";
import { setUserGroups, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props { user: UserDetail }

export function GroupsPicker({ user }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const groupsQ = useQuery({ queryKey: queryKeys.groups.list, queryFn: listGroups, staleTime: 60_000 });
  const [selected, setSelected] = useState<Set<number>>(new Set(user.group_ids));

  useEffect(() => { setSelected(new Set(user.group_ids)); }, [user.group_ids]);

  const m = useMutation({
    mutationFn: () => setUserGroups(user.id, Array.from(selected)),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Groups saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  const all = groupsQ.data ?? [];
  const dirty = useMemo(() => {
    const a = new Set(user.group_ids); if (a.size !== selected.size) return true;
    for (const id of selected) if (!a.has(id)) return true;
    return false;
  }, [selected, user.group_ids]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (groupsQ.isLoading) return <div className="dim mono">Loading groups…</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480, fontSize: 12 }}>
      <div className="dim" style={{ fontSize: 11 }}>
        {selected.size} of {all.length} groups assigned
      </div>
      <div style={{
        border: "1px solid var(--color-border)", borderRadius: 4,
        background: "var(--color-bg-2)", padding: 10,
        display: "grid", gap: 6, maxHeight: 320, overflow: "auto",
      }}>
        {all.length === 0 && <div className="dim">No groups defined.</div>}
        {all.map((g) => (
          <label key={g.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
            <span className="mono">{g.name}</span>
            <span className="dim" style={{ fontSize: 10.5 }}>· {g.permission_count} perms</span>
          </label>
        ))}
      </div>
      <button className="btn primary" disabled={!dirty || m.isPending} onClick={() => m.mutate()}
              style={{ alignSelf: "flex-start" }}>
        {m.isPending ? "Saving…" : "Save groups"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: wire it into `users-detail.tsx`**

Replace `{tab === "Groups" && <Placeholder name="Groups" />}` with `{tab === "Groups" && <GroupsPicker user={user} />}`. Add `import { GroupsPicker } from "@/components/users/GroupsPicker";`.

- [ ] **Step 3: typecheck + build + commit**

```bash
git add frontend/app/src/components/users/GroupsPicker.tsx frontend/app/src/routes/users-detail.tsx
git commit -m "feat(spa): Groups tab in UserDetailPage — m2m picker"
```

---

### Task H2: Permissions tab + PermissionsPicker

**Files:**
- Create: `frontend/app/src/components/users/PermissionsPicker.tsx`
- Modify: `frontend/app/src/routes/users-detail.tsx`

- [ ] **Step 1: implement `PermissionsPicker.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { listPermissions, type Permission } from "@/lib/api/permissions";
import { setUserPermissions, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props { user: UserDetail }

function groupBy(perms: Permission[]) {
  const map = new Map<string, Permission[]>();
  for (const p of perms) {
    const key = `${p.content_type.app_label}.${p.content_type.model}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function PermissionsPicker({ user }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const permsQ = useQuery({
    queryKey: queryKeys.permissions.list(),
    queryFn: () => listPermissions(),
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set(user.permission_ids));
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => { setSelected(new Set(user.permission_ids)); }, [user.permission_ids]);

  const grouped = useMemo(() => groupBy(permsQ.data ?? []), [permsQ.data]);

  const m = useMutation({
    mutationFn: () => setUserPermissions(user.id, Array.from(selected)),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Permissions saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  const dirty = useMemo(() => {
    const a = new Set(user.permission_ids); if (a.size !== selected.size) return true;
    for (const id of selected) if (!a.has(id)) return true;
    return false;
  }, [selected, user.permission_ids]);

  function togglePerm(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleGroupOpen(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (permsQ.isLoading) return <div className="dim mono">Loading permissions…</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 600, fontSize: 12 }}>
      <div className="dim" style={{ fontSize: 11 }}>
        {selected.size} permissions assigned · {grouped.length} content types
      </div>
      <div style={{
        border: "1px solid var(--color-border)", borderRadius: 4,
        background: "var(--color-bg-2)", padding: 8,
        maxHeight: 420, overflow: "auto",
      }}>
        {grouped.map(([key, perms]) => {
          const groupSelected = perms.filter((p) => selected.has(p.id)).length;
          const isOpen = openGroups.has(key);
          return (
            <div key={key}>
              <button onClick={() => toggleGroupOpen(key)}
                      style={{
                        background: "transparent", border: 0, color: "inherit",
                        cursor: "pointer", textAlign: "left", width: "100%",
                        padding: "5px 6px", fontSize: 11.5, display: "flex", gap: 6,
                      }}>
                <span className="mono">{isOpen ? "▾" : "▸"}</span>
                <span className="mono">{key}</span>
                <span className="dim">· {groupSelected}/{perms.length}</span>
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 22, display: "grid", gap: 4 }}>
                  {perms.map((p) => (
                    <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={selected.has(p.id)}
                             onChange={() => togglePerm(p.id)} />
                      <span className="mono" style={{ fontSize: 10.5 }}>{p.codename}</span>
                      <span className="dim" style={{ fontSize: 10 }}>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn primary" disabled={!dirty || m.isPending} onClick={() => m.mutate()}
              style={{ alignSelf: "flex-start" }}>
        {m.isPending ? "Saving…" : "Save permissions"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: wire into `users-detail.tsx`**

Replace `{tab === "Permissions" && <Placeholder name="Permissions" />}` with `{tab === "Permissions" && <PermissionsPicker user={user} />}`. Add the import.

- [ ] **Step 3: typecheck + build + commit**

```bash
git add frontend/app/src/components/users/PermissionsPicker.tsx frontend/app/src/routes/users-detail.tsx
git commit -m "feat(spa): Permissions tab in UserDetailPage — collapsed-by-content_type tree"
```

---

## Phase I — API Token tab + TokenManageModal

### Task I1: TokenSection (shared) + API Token tab

**Files:**
- Create: `frontend/app/src/components/users/TokenSection.tsx` (reused for admin tab + self-service modal)
- Modify: `frontend/app/src/routes/users-detail.tsx`

- [ ] **Step 1: implement `TokenSection.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import {
  getMyToken, getUserToken, revokeMyToken, revokeUserToken,
  rotateMyToken, rotateUserToken, type TokenInfo,
} from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  /** undefined = self-service (uses /me/token/), number = admin manages a specific user. */
  userId?: number;
  username?: string;
}

export function TokenSection({ userId, username }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isAdminScope = userId !== undefined;

  const queryKey = isAdminScope ? queryKeys.tokens.user(userId!) : queryKeys.tokens.me;
  const queryFn = () => (isAdminScope ? getUserToken(userId!) : getMyToken());

  const tokenQ = useQuery({ queryKey, queryFn });

  const [reveal, setReveal] = useState(false);
  const [justRotated, setJustRotated] = useState<string | null>(null);

  const rotate = useMutation({
    mutationFn: () => (isAdminScope ? rotateUserToken(userId!) : rotateMyToken()),
    onSuccess: (data: TokenInfo) => {
      qc.setQueryData(queryKey, data);
      setJustRotated(data.key);
      setReveal(true);
      showToast(`Token ${data.key ? "generated/rotated" : "saved"}.`, "success");
    },
    onError: () => showToast("Token operation failed.", "error"),
  });

  const revoke = useMutation({
    mutationFn: () => (isAdminScope ? revokeUserToken(userId!) : revokeMyToken()),
    onSuccess: () => {
      qc.setQueryData(queryKey, { key: null, created: null });
      setJustRotated(null);
      setReveal(false);
      showToast("Token revoked.", "success");
    },
    onError: () => showToast("Revoke failed.", "error"),
  });

  if (tokenQ.isLoading) return <div className="dim mono">Loading token…</div>;
  const tok = tokenQ.data;
  const hasToken = !!tok?.key;

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 540, fontSize: 12 }}>
      <div>
        <strong>Status:</strong> {hasToken ? "✅ Active" : "⊘ No token"}
      </div>
      {hasToken && (
        <>
          <div className="dim" style={{ fontSize: 11 }}>
            Created: {tok!.created ?? "—"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code className="mono" style={{
              padding: "5px 8px", background: "var(--color-bg-2)",
              border: "1px solid var(--color-border)", borderRadius: 3, fontSize: 11,
              flex: 1, wordBreak: "break-all",
            }}>
              {reveal ? tok!.key : "●".repeat(40)}
            </code>
            <button className="btn ghost" onClick={() => setReveal((r) => !r)}>
              {reveal ? "Hide" : "Reveal"}
            </button>
            {reveal && tok!.key && (
              <button className="btn ghost" onClick={() => navigator.clipboard.writeText(tok!.key!)}>
                Copy
              </button>
            )}
          </div>
        </>
      )}

      {justRotated && (
        <div style={{
          padding: 8, fontSize: 11,
          background: "#23863622", color: "#7ee787",
          border: "1px solid #7ee78733", borderRadius: 3,
        }}>
          New token displayed above. Save it — it will be masked next time you load this page.
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={() => {
          if (hasToken && !window.confirm(`Rotate ${username ?? "your"} token? Existing key will stop working immediately.`)) return;
          rotate.mutate();
        }} disabled={rotate.isPending}>
          {rotate.isPending ? "…" : hasToken ? "Rotate" : "Generate token"}
        </button>
        {hasToken && (
          <button className="btn danger" onClick={() => {
            if (!window.confirm("Revoke token? This cannot be undone.")) return;
            revoke.mutate();
          }} disabled={revoke.isPending}>
            {revoke.isPending ? "…" : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: wire into `users-detail.tsx`**

Replace `{tab === "API Token" && <Placeholder name="API Token" />}` with:
```tsx
{tab === "API Token" && <TokenSection userId={user.id} username={user.username} />}
```
Add the import.

- [ ] **Step 3: typecheck + build + commit**

```bash
git add frontend/app/src/components/users/TokenSection.tsx frontend/app/src/routes/users-detail.tsx
git commit -m "feat(spa): API Token tab in UserDetailPage + reusable TokenSection

TokenSection is reused for admin-managing-other (userId prop) and
self-service (no prop, uses /me/token/). Reveal toggle, copy button,
warning banner after rotate, confirm modal on rotate-existing or
revoke."
```

---

### Task I2: TokenManageModal + Topbar wiring

**Files:**
- Create: `frontend/app/src/components/account/TokenManageModal.tsx`
- Modify: `frontend/app/src/components/shell/Topbar.tsx`

- [ ] **Step 1: implement `TokenManageModal.tsx`**

```tsx
import { TokenSection } from "@/components/users/TokenSection";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TokenManageModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width={560}>
        <DialogHeader><DialogTitle>API token</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="dim" style={{ margin: 0, marginBottom: 4, fontSize: 11.5 }}>
            Use this key with <code className="mono">Authorization: Token &lt;key&gt;</code> header
            for programmatic access to <code className="mono">/apiv2/*</code> endpoints. See <a href="/docs">/docs</a>.
          </p>
          <TokenSection />
        </DialogBody>
        <DialogFooter>
          <button className="btn" onClick={() => onOpenChange(false)}>Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: wire into Topbar**

In `frontend/app/src/components/shell/Topbar.tsx`:
1. Add import: `import { TokenManageModal } from "@/components/account/TokenManageModal";` and `import { Key } from "lucide-react";` (or reuse `KeyRound` for both items? — use the new icon `Key` for token to differentiate from password's KeyRound).
2. Add state: `const [tokenOpen, setTokenOpen] = useState(false);`
3. Add menuitem between "Change password" and the separator before Sign out:
   ```tsx
   <DropdownMenuItem onSelect={() => setTokenOpen(true)}>
     <Key size={12} />
     <span>API token</span>
   </DropdownMenuItem>
   ```
4. Add `<TokenManageModal open={tokenOpen} onOpenChange={setTokenOpen} />` next to the existing 2 modals at the bottom.

- [ ] **Step 3: typecheck + build + commit**

```bash
git add frontend/app/src/components/account/TokenManageModal.tsx frontend/app/src/components/shell/Topbar.tsx
git commit -m "feat(spa): TokenManageModal in avatar dropdown — self-service token

Avatar dropdown now: Edit profile / Change password / API token /
Sign out. TokenManageModal reuses TokenSection (no userId prop = self
mode using /me/token/)."
```

---

## Phase J — UserCreatePage

### Task J1: /users/new

**Files:**
- Create: `frontend/app/src/routes/users-new.tsx`
- Modify: `frontend/app/src/router.tsx`

- [ ] **Step 1: implement page**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Centered } from "@/components/shared/Centered";
import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/components/shared/Toast";
import { createUser, type UserCreatePayload } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

export default function UsersNewRoute() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (p: UserCreatePayload) => createUser(p),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast(`Created ${user.username}.`, "success");
      navigate(`/users/${user.id}`);
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object") {
        setErr(JSON.stringify(data));
      } else setErr("Create failed.");
    },
  });

  if (me.isLoading) return <Centered><Spinner size={14} /></Centered>;
  if (!me.data?.is_staff) {
    navigate("/", { replace: true });
    return null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    m.mutate({
      username, password, email, first_name: firstName, last_name: lastName,
      is_staff: isStaff, is_superuser: isSuperuser,
    });
  }

  const meIsSuper = me.data?.is_superuser ?? false;

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", "New"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 520 }}>
          <div className="panel-h">Add user</div>
          <form onSubmit={submit} style={{ padding: 14, display: "grid", gap: 10, fontSize: 12 }}>
            <Field label="Username *">
              <input value={username} onChange={(e) => setUsername(e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Initial password *">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" style={inputStyle} />
            </Field>
            <Field label="Confirm *">
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
            </Field>
            <Toggle label="is_staff" checked={isStaff} onChange={setIsStaff} />
            {meIsSuper && <Toggle label="is_superuser" checked={isSuperuser} onChange={setIsSuperuser} />}
            {err && <div style={{ fontSize: 11, color: "var(--color-sev-crit, #ff7b72)" }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={() => navigate("/users")}>Cancel</button>
              <button type="submit" className="btn primary" disabled={m.isPending}>
                {m.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>{label}</label>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)", borderRadius: 3,
};
```

- [ ] **Step 2: register route**

```tsx
const UsersNewRoute = lazy(() => import("@/routes/users-new"));
{ path: "users/new", element: withSuspense(<UsersNewRoute />) },
```

Place it BEFORE `users/:id` so the literal `new` doesn't get captured by `:id`.

- [ ] **Step 3: typecheck + build + commit**

```bash
git add frontend/app/src/routes/users-new.tsx frontend/app/src/router.tsx
git commit -m "feat(spa): /users/new — admin create user form"
```

---

## Phase K — Sidebar swap (delete external admin link, add internal /users)

### Task K1: Sidebar update

**Files:**
- Modify: `frontend/app/src/components/shell/Sidebar.tsx`

- [ ] **Step 1: edit Sidebar's `ADMIN_ITEMS`**

In `frontend/app/src/components/shell/Sidebar.tsx`, find the `ADMIN_ITEMS` array. Replace the existing Users entry:

```tsx
{ to: "/admin/auth/user/", label: "Users", icon: Icon.users, external: true, staffOnly: true },
```

with:

```tsx
{ to: "/users", label: "Users", icon: Icon.users, staffOnly: true },
```

(no `external: true`, since this is now an SPA route).

- [ ] **Step 2: typecheck + build + commit**

```bash
git add frontend/app/src/components/shell/Sidebar.tsx
git commit -m "feat(sidebar): Users link points to SPA /users (was external /admin/auth/user/)

Phase D-J landed the SPA-native user management UI. Sidebar now keeps
users inside the SPA instead of jumping to Django admin. /admin/auth/user/
is still reachable via direct URL for the rare cases not yet covered
(rare permission_count audits, etc.) but no longer linked from the SPA."
```

---

## Phase L — e2e + docs

### Task L1: Playwright e2e

**Files:**
- Create: `frontend/app/tests/e2e/users-management.spec.mjs`

- [ ] **Step 1: write spec**

```js
/**
 * /users SPA management surface — list / detail tabs / token round-trip.
 *
 * Uses an EPHEMERAL test user `e2e-tmp` to avoid disturbing admin/cuckoo
 * setup. The test creates the user, exercises every tab, then deletes it.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

async function login(page) {
  await page.goto(`${SPA}/accounts/login/`);
  await page.fill('input[name="login"]', USER);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

test.describe.configure({ mode: "serial" });

test("/users list renders and shows admin", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/users`);
  await page.waitForTimeout(1500);
  await expect(page.locator("table.data tbody tr")).not.toHaveCount(0);
  await expect(page.locator("text=admin").first()).toBeVisible();
});

test("create + edit + delete e2e-tmp user", async ({ page }) => {
  test.setTimeout(120000);
  await login(page);

  // 1. create
  await page.goto(`${SPA}/users/new`);
  await page.locator('input[autocomplete="username"], input[type="text"]').first().fill("e2e-tmp");
  await page.locator('input[type="password"]').first().fill("E2eTmpPass987!");
  await page.locator('input[type="password"]').nth(1).fill("E2eTmpPass987!");
  await page.locator('input[type="email"]').fill("e2e@example.com");
  await page.getByRole("button", { name: "Create user" }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  const url = page.url();
  const userId = Number(url.match(/\/users\/(\d+)$/)?.[1]);

  // 2. Basic tab — change first_name → save
  await page.locator('input').nth(2).fill("E2E");  // first_name input position
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("User updated.")).toBeVisible({ timeout: 4000 });

  // 3. API Token tab — generate
  await page.getByRole("button", { name: "API Token" }).click();
  await page.getByRole("button", { name: /Generate token/ }).click();
  await expect(page.getByText("Token generated/rotated.")).toBeVisible({ timeout: 4000 });

  // 4. Delete user (cleanup)
  await page.getByRole("button", { name: "Basic" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});

test("avatar dropdown API token modal works", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("menuitem", { name: /API token/ }).click();
  await expect(page.getByRole("heading", { name: "API token" })).toBeVisible({ timeout: 4000 });
  await page.getByRole("button", { name: "Close" }).click();
});
```

- [ ] **Step 2: deploy backend + SPA, run spec**

Build SPA, rsync backend + SPA bundle, restart cape-web (use the same pattern as Phase E1's deploy block), then:

```bash
cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS='cape123!' \
  timeout 120 npx playwright test tests/e2e/users-management.spec.mjs --reporter=line
```

Expected: 3 passed.

If e2e leaves an `e2e-tmp` user behind on test failure, manually delete via Django shell:
```bash
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  "cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py shell <<'PY'
from django.contrib.auth.models import User
User.objects.filter(username='e2e-tmp').delete()
PY"
```

- [ ] **Step 3: commit**

```bash
git add frontend/app/tests/e2e/users-management.spec.mjs
git commit -m "test(e2e): users-management — list + create-edit-delete + token

Locks in: list page renders + filter, e2e-tmp create→edit→token→delete
round-trip (auto-cleanup, idempotent), avatar dropdown API token modal."
```

---

### Task L2: docs — api-reference + deploy doc

**Files:**
- Modify: `docs/web/api-reference.md`
- Modify: `docs/web/deploy-192.168.1.6.md`

- [ ] **Step 1: append api-reference sections for the 19 new endpoints**

Open `docs/web/api-reference.md` and append a new section "Users (admin)" after the existing Me / Audit sections. Document each endpoint with:
- Method + path
- Permission
- Request body (if any) / query params (if any)
- Response sample
- Audit action emitted (if any)

(Use the spec §4 as the authoritative source; the doc just translates it. Concise table form is fine — no need for full JSON examples on every endpoint, just the non-trivial ones like create/bulk-action.)

- [ ] **Step 2: append deploy record**

Open `docs/web/deploy-192.168.1.6.md` and append:

```markdown
## 2026-05-03 — SPA-native user management + API token management

按 `docs/superpowers/specs/2026-05-03-spa-user-management-design.md` +
`docs/superpowers/plans/2026-05-03-spa-user-management.md` 部署。

### 后端 (apiv3, 19 个新 endpoint)
- 用户 CRUD: GET/POST /users/, GET/PATCH/DELETE /users/<id>/
- 用户 mutation: set-password, activate, deactivate, bulk-action
- 用户 m2m: PATCH /users/<id>/groups/, /users/<id>/permissions/
- 引用数据: GET /groups/, GET /permissions/?content_type=
- API Token: GET/POST/DELETE /me/token/, /users/<id>/token/

### 审计 (9 个新 ACTION)
user_create / user_update / user_delete / user_activate / user_deactivate /
user_set_password (user_mgmt 类目) +
token_create / token_rotate / token_revoke (auth 类目)

### 前端 (3 个新路由)
- /users — 列表 (search/filter/cursor 分页/bulk action)
- /users/new — 创建表单
- /users/<id> — 5-tab 详情 (Basic / Groups / Permissions / API Token / Profile)
- 头像下拉新增 "API token" 项 → TokenManageModal (复用 TokenSection)

### Sidebar
- Users 链接从 external /admin/auth/user/ 切换到内部 SPA /users (不再跳 Django admin)
- /admin/auth/user/ 仍可直接 URL 访问

### 实测
- pytest backend: 11 测试模块全绿 (XX 个用例)
- Playwright: users-management.spec.mjs 3/3 PASS
- Token round-trip: rotate 后 apiv2/cuckoo/status/ 用新 key 仍 200

凭证不变 (admin / cape123!)。apiv2 token API 不变。
```

- [ ] **Step 3: commit + push**

```bash
git add docs/web/api-reference.md docs/web/deploy-192.168.1.6.md
git commit -m "docs: api-reference + deploy record for SPA user-management feature"
git push origin refactor/web-spa
```

---

## Final

### Task F1: full deploy + smoke + push

**Files:** none modified.

- [ ] **Step 1: deploy whole stack**

```bash
cd /Users/lamba/github/cape

# Backend
sshpass -p ubuntu rsync -av --delete -e "ssh -o StrictHostKeyChecking=no" \
  --exclude=__pycache__ --exclude=siteauth.sqlite --exclude=migrations/__pycache__ \
  --exclude=static/spa \
  web/ ubuntu@192.168.1.6:/tmp/cape-web/

sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S rsync -av --delete --exclude=__pycache__ --exclude=siteauth.sqlite --exclude=static/spa /tmp/cape-web/ /opt/CAPEv2/web/ \
   && echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web'

# SPA
cd frontend/app && npm run build
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S chown -R ubuntu:ubuntu /opt/CAPEv2/web/static/spa'
sshpass -p ubuntu rsync -av --delete -e "ssh -o StrictHostKeyChecking=no" dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web/static/spa \
   && echo ubuntu | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "ready: %{http_code}\n" http://192.168.1.6:8000/
```

- [ ] **Step 2: full e2e battery (split)**

```bash
cd /Users/lamba/github/cape/frontend/app
export PARITY_SPA_URL=http://192.168.1.6:8000 SPA_LOGIN_USER=admin
export 'SPA_LOGIN_PASS=cape123!'

# batch 1
npx playwright test tests/e2e/audit-log.spec.mjs tests/e2e/account-self-service.spec.mjs tests/e2e/users-management.spec.mjs --reporter=line

# restart between batches to avoid SQLAlchemy pool exhaustion
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S systemctl restart cape-web' && sleep 4

# batch 2
npx playwright test tests/e2e/smoke.spec.mjs tests/e2e/recent-detail-display.spec.mjs tests/e2e/docs-page.spec.mjs tests/e2e/phase-a-network-probe.spec.mjs --reporter=line
```

Expected: all green (≈21 tests total).

- [ ] **Step 3: push to origin**

```bash
git push origin refactor/web-spa
```

- [ ] **Step 4: no further commit needed.**

---

## Self-Review Checklist (controller, after all tasks)

1. Spec §4.1 user CRUD — A1-A4 + B1-B4 cover the 11 endpoints ✅
2. Spec §4.2 reference data — C1 covers /groups/ + /permissions/ ✅
3. Spec §4.3 token endpoints — D1 covers all 6 ✅
4. Spec §5 9 audit ACTIONS — A1 ✅; per-mutation audit.log() in B1-B4 / C1 / D1 ✅
5. Spec §6.1 routes — F2 (/users), J1 (/users/new), G1 (/users/:id) ✅
6. Spec §6.2 list page — F2 + F3 ✅
7. Spec §6.3 5 tabs — G1 (shell), G2 (Basic+Profile+SetPassword), H1 (Groups), H2 (Permissions), I1 (API Token) ✅
8. Spec §6.5 self-service token — I2 ✅
9. Spec §7 sidebar swap — K1 ✅
10. Spec §9 verification matrix — L1 (Playwright) + Phase A-D pytest ✅
11. Spec §13 default decisions — embedded in implementation
12. Spec §11 out-of-scope — not implemented (no email invite, no multi-token, no group CRUD) ✅
