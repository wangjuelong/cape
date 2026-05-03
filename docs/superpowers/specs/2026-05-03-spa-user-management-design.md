# SPA-Native 用户管理 + API Token 管理 设计

**Status:** approved-pending-spec-review
**Date:** 2026-05-03
**Branch:** refactor/web-spa
**Architecture choice:** SPA-native 全套 user CRUD（替代 Django `/admin/auth/user/` 入口）+ 一并加 API token 自服务 / 管理。`/admin/` 仍可直接 URL 访问（功能保留），但 SPA 不再链接它。

---

## 1. 目标 (Goal)

让所有用户管理工作（is_staff 用户管别人 + 普通用户管自己 token）都在 SPA 内完成，视觉与现有 SOC 风格一致：
- is_staff 用户在 `/users` 列表 + `/users/<id>` 多 tab 编辑页做完整 CRUD：基本字段 / groups / permissions / API token / UserProfile
- 普通用户在头像下拉新增 "API token" 项，自助生成 / 轮转 / 撤销自己的 token
- 移除 SPA sidebar 中 `/admin/auth/user/` 的外链入口

零依赖添加（不引入 dj-rest-knox / unfold / jazzmin）；DRF 默认 Token 模型 (1-per-user) 沿用。

---

## 2. 关键约束 (Constraints)

- **Django admin /admin/auth/user/ 功能不变** — 直接 URL 访问继续工作。SPA 仅停止主动链接它。
- **不引入 multi-token / TTL / IP allowlist** — DRF 默认 Token 行为；ramp 复杂功能在独立 spec
- **后端完成再做前端** — Phase A-E 全部落地（含 pytest）后开 Phase F frontend
- **审计完整覆盖每个 mutation** — 9 个新 ACTION + 每个 view 显式 `audit.log()` 调用
- **Permission/Group SPA 内不可创建** — 仅消费现有 groups/permissions（picker 表）；建/改/删 group 本身仍走 `/admin/`
- **三个高危操作的硬约束**：
  - 删自己：后端 400 + 前端 button disabled
  - 删 superuser：仅 superuser 可删
  - is_superuser toggle：仅 superuser UI 可见

---

## 3. 架构 (Architecture)

```
┌──── SPA ────────────────────────────────────────────────────┐
│ Sidebar Admin > Users  →  /users (内部 SPA 路由)             │
│  /users           UserListPage    (search + filter + bulk)  │
│  /users/new       UserCreatePage                             │
│  /users/<id>      UserDetailPage  (5 tabs)                   │
│                                                              │
│ Topbar 头像下拉:                                              │
│  Edit profile        ← (现有)                                │
│  Change password     ← (现有)                                │
│  API token           ← 新                                    │
│  ─────                                                       │
│  Sign out                                                    │
└──────────────────────────────────────────────────────────────┘

┌──── apiv3 endpoints ────────────────────────────────────────┐
│ User CRUD (IsAdminUser):                                     │
│   /users/  list  • /users/<id>/  detail  • CRUD             │
│   /users/<id>/{set-password,activate,deactivate}             │
│   /users/bulk-action/  (activate/deactivate/delete)         │
│   /users/<id>/{groups,permissions}/  (m2m PATCH)             │
│   /groups/  list  • /permissions/  list                      │
│ Token (mixed):                                               │
│   /me/token/  GET/POST/DELETE   (IsAuthenticated)            │
│   /users/<id>/token/  GET/POST/DELETE  (IsAdminUser)         │
└──────────────────────────────────────────────────────────────┘

┌──── Audit ──────────────────────────────────────────────────┐
│ 9 new ACTIONs in audit_log/__init__.py:                      │
│   user_create / user_update / user_delete                   │
│   user_activate / user_deactivate / user_set_password       │
│   token_create / token_rotate / token_revoke                │
│ Each apiv3 mutation view emits explicit audit.log() entry.   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 后端 apiv3 endpoint 详表

### 4.1 User CRUD（11 个 endpoint，全部 `IsAdminUser`）

#### `GET /api/v3/users/`

**Query**:
- `search` — 模糊匹配 username / email / first_name / last_name
- `is_staff`, `is_superuser`, `is_active` — bool 过滤
- `group` — 按 group id/name 过滤
- `cursor` — 游标分页（与 audit_log 一致）
- `limit` — 默认 20，最大 100
- `ordering` — `username | -username | date_joined | -date_joined | last_login | -last_login`

**Response**:
```json
{
  "data": [
    {
      "id": 1, "username": "admin", "email": "...", "first_name": "...",
      "last_name": "...", "is_staff": true, "is_superuser": false,
      "is_active": true, "last_login": "2026-05-03T...", "date_joined": "...",
      "group_count": 0, "has_token": true,
      "subscription": "5/m"
    }
  ],
  "next_cursor": "<int>" | null,
  "total": 42
}
```

#### `GET /api/v3/users/<id>/`

完整形态：上面所有字段 + `group_ids: [...]` + `permission_ids: [...]` + `userprofile: {subscription, reports}` + `token: {key, created} | null`（仅 IsAdminUser 看到 token；GET /me/ 已暴露 has_token bool）

#### `POST /api/v3/users/`

**Request**:
```json
{
  "username": "alice",
  "password": "InitialPassword!",
  "email": "alice@example.com",
  "first_name": "Alice",
  "last_name": "Liddell",
  "is_staff": false,
  "is_superuser": false,
  "is_active": true
}
```

**Validation**:
- username unique
- password 通过 `AUTH_PASSWORD_VALIDATORS`
- 非 superuser 调用方不能设 `is_superuser: true`

**Response**: 201 with the same shape as `GET /users/<id>/`. Audit: `user_create`.

#### `PATCH /api/v3/users/<id>/`

任何 User 字段（除 username 不可改 — username 是 identifier）+ UserProfile inline 字段：
```json
{
  "email": "...", "first_name": "...", "last_name": "...",
  "is_staff": true, "is_superuser": true, "is_active": true,
  "userprofile": {"subscription": "10/m", "reports": true}
}
```

**Validation**:
- 非 superuser 不能设别人 `is_superuser: true`（防权限提升）
- `is_active: false` 时若 target 是自己 → 400
- groups/permissions 不在此 endpoint 改（用专门的 m2m endpoint）

Audit: `user_update`，metadata 含 `fields: [...]`（值不存）。

#### `DELETE /api/v3/users/<id>/`

**Validation**:
- target == request.user → 400 "Cannot delete yourself."
- target.is_superuser == true 且 request.user.is_superuser == false → 400 "Only superuser can delete superuser."

Audit: `user_delete`。Hard delete（CASCADE 到 UserProfile / Token）。

#### `POST /api/v3/users/<id>/set-password/`

**Request**: `{password: "NewPass!"}`. 通过 `AUTH_PASSWORD_VALIDATORS`. 不要求 current_password（管理员强改）.

Side effect: `user.set_password()` + save。**不**触发 allauth signal（避免审计混淆 `password_change` 自服务 vs `user_set_password` admin）.

Audit: `user_set_password`，actor=request.user，target=<id>。

#### `POST /api/v3/users/<id>/activate/` / `POST /api/v3/users/<id>/deactivate/`

Sugar shortcut for `PATCH {is_active: true/false}`. Audit: `user_activate` / `user_deactivate`.

#### `POST /api/v3/users/bulk-action/`

```json
{"ids": [1, 2, 3], "action": "activate" | "deactivate" | "delete"}
```

逐个执行，独立审计 row per id。返回 `{success: [...], failed: [{id, reason}]}`。

action == "delete" 时同样适用上面的删除约束（拒绝自己 + superuser 保护）。

#### `PATCH /api/v3/users/<id>/groups/`

```json
{"group_ids": [1, 3, 5]}
```

Replace m2m。Audit: `user_update` with `metadata.groups_changed: true`.

#### `PATCH /api/v3/users/<id>/permissions/`

同上但操作 `user_permissions` m2m。

### 4.2 Reference data（GET 列表，IsAdminUser）

#### `GET /api/v3/groups/`

`{data: [{id, name, permission_count}]}` — 不分页（通常 < 50 个 group）。

#### `GET /api/v3/permissions/`

`{data: [{id, name, codename, content_type: {app_label, model}}]}` — 数百条；query 支持 `?content_type=auth.user` 筛选。

### 4.3 API Token endpoint

| Method | Path | Permission | Behavior |
|---|---|---|---|
| GET | `/api/v3/me/token/` | IsAuthenticated | `{key, created}` 或 `{key: null, created: null}` 表示未生成 |
| POST | `/api/v3/me/token/` | IsAuthenticated | 若已存在 → delete 旧 + create 新 (rotate)；返回 `{key, created}`。Audit: `token_rotate` 或 `token_create`（按是否已存在） |
| DELETE | `/api/v3/me/token/` | IsAuthenticated | delete 自己的 token；204。Audit: `token_revoke` |
| GET | `/api/v3/users/<id>/token/` | IsAdminUser | 同上但目标用户 |
| POST | `/api/v3/users/<id>/token/` | IsAdminUser | 同上 |
| DELETE | `/api/v3/users/<id>/token/` | IsAdminUser | 同上 |

**Token 是 DRF 默认 `rest_framework.authtoken.models.Token`** — 1-per-user，明文存储 `key` 字段（DRF 模型限制；reveal 在 SPA 内是可接受的，因为 DB-访问已是后门）。

---

## 5. 审计 (Audit) — 9 个新 ACTION

```python
# web/audit_log/__init__.py 增加:
ACTIONS += (
    ("user_create",       "User Created",       "user_mgmt"),
    ("user_update",       "User Updated",       "user_mgmt"),
    ("user_delete",       "User Deleted",       "user_mgmt"),
    ("user_activate",     "User Activated",     "user_mgmt"),
    ("user_deactivate",   "User Deactivated",   "user_mgmt"),
    ("user_set_password", "Admin Set Password", "user_mgmt"),
    ("token_create",      "API Token Created",  "auth"),
    ("token_rotate",      "API Token Rotated",  "auth"),
    ("token_revoke",      "API Token Revoked",  "auth"),
)
```

每个 mutation 在 view 内显式 `audit.log()`。**Metadata 不存值，只存字段名 / 操作 target 标识**：

```python
audit.log(
    "user_update",
    request=request,
    actor=request.user,
    target_type="user",
    target_id=str(target_user.id),
    target_label=target_user.username,
    fields=changed_field_names,  # 不存值
)
```

---

## 6. 前端 SPA — 路由结构

### 6.1 新路由

| Path | Component | 说明 |
|---|---|---|
| `/users` | `UserListPage` | 列表 + 搜索 + filter chips + bulk action bar |
| `/users/new` | `UserCreatePage` | 新建用户 form |
| `/users/<id>` | `UserDetailPage` | 多 tab 详情 / 编辑 |

所有路由 staffOnly gate（与 `/audit` 同 pattern）。

### 6.2 UserListPage 结构

```
┌──────────────────────────────────────────────────────────────┐
│ Crumbs: CAPE > Admin > Users               [+ Add user]      │
├──────────────────────────────────────────────────────────────┤
│ [Search input............................]  [Apply][Clear] │
│ Filters: [is_staff ▾] [is_active ▾] [group ▾] [order ▾]    │
├──────────────────────────────────────────────────────────────┤
│ Bulk actions ([N selected]): [Activate] [Deactivate] [Delete]│
├──────────────────────────────────────────────────────────────┤
│ ☐ │ Username │ Email │ Staff │ Active │ Last login │ Groups │
│ ☐ │ admin    │ ...   │ ✓     │ ✓      │ 12 min ago │ —      │
│ ☐ │ ...                                                      │
│                                            [Load more] (cursor)│
└──────────────────────────────────────────────────────────────┘
```

行点击 → navigate `/users/<id>`. 复选框驱动 bulk bar 显隐 + 计数。

### 6.3 UserDetailPage — 5 个 tab

```
┌──────────────────────────────────────────────────────────────┐
│ Crumbs: CAPE > Admin > Users > alice                         │
│                                          [Save] [⋯] (delete) │
├──────────────────────────────────────────────────────────────┤
│ [Basic] [Groups] [Permissions] [API Token] [Profile]         │
├──────────────────────────────────────────────────────────────┤
│ <tab content>                                                 │
└──────────────────────────────────────────────────────────────┘
```

- **Basic**：first_name / last_name / email / is_staff / is_superuser (only superuser sees toggle) / is_active. + [Set password] 按钮 → 弹 `SetPasswordModal`.
- **Groups**：双列 picker — left 当前 m2m，right 可选 group。[Save groups] 提交 PATCH `/users/<id>/groups/`.
- **Permissions**：按 `content_type` 折叠分组；checkbox tree。[Save permissions].
- **API Token**：见 §6.4。
- **Profile**：subscription text input + reports checkbox + readonly date_joined / last_login.

### 6.4 API Token tab (in UserDetailPage)

```
┌──────────────────────────────────────────────────────────────┐
│ ┌── API Token ────────────────────────────────────────────┐ │
│ │  Status: ✅ Active                                       │ │
│ │  Created: 2026-04-30 12:34:56                            │ │
│ │  Key:     ●●●●●●●●●●●●●●●●●●●●●●●●●●  [👁 Reveal]      │ │
│ │                                                          │ │
│ │  [Rotate] [Revoke]                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

When no token:
┌──────────────────────────────────────────────────────────────┐
│ ┌── API Token ────────────────────────────────────────────┐ │
│ │  Status: ⊘ No token                                      │ │
│ │  [Generate token]                                        │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

After Rotate / Generate, the new key briefly appears unmasked with
a copy button + "Save this key, it will be masked next reload" notice.
```

### 6.5 自服务 TokenManageModal

avatar 下拉新增 "API token" 项（在 Edit profile / Change password 之间或之后）→ 打开 `TokenManageModal`，UI 与上面 §6.4 完全一致，但 endpoint 用 `/api/v3/me/token/`。

### 6.6 复用的前端基础设施

- `Dialog` (radix wrapper)（已有）
- `Toast` + `useToast`（已有）
- TanStack Query mutations，invalidate 关键 query keys：
  - `queryKeys.users.list(filters)`
  - `queryKeys.users.detail(id)`
  - `queryKeys.me`
  - `queryKeys.audits.all` (token rotate 后审计 list 能立刻看到新行)

---

## 7. Sidebar / Topbar 改动

### Sidebar
- 删 `{ to: "/admin/auth/user/", external: true, staffOnly: true }`（user-management spec 加的那条）
- 加 `{ to: "/users", label: "Users", icon: Icon.users, staffOnly: true }` —— 内部 SPA 路由
- 位置：Admin section 中 `Audit` 之后、`API Docs` 之前

### Topbar
- 头像下拉在 "Edit profile" / "Change password" 之间（或之后，UI 决定）加 "API token" 项 → `TokenManageModal`
- 选择把它放在第三个，与 profile / password 同列

---

## 8. 实现顺序 (Phases)

```
Phase A   apiv3 user CRUD (list/get/create/update/delete) + tests        (基础)
Phase B   apiv3 mutations (set-password / activate / deactivate / bulk)  (CRUD 全)
Phase C   apiv3 m2m (groups/permissions PATCH) + groups/permissions list (m2m)
Phase D   apiv3 token endpoints (me/token/* + users/<id>/token/*)        (token)
Phase E   audit ACTIONs + 各 view 显式 audit.log() hook                  (审计)
─────── BACKEND DONE，pytest 全绿 ───────
Phase F   SPA UserListPage + 路由 + filter/sort/分页                     (列表)
Phase G   SPA UserDetailPage 多 tab (Basic / Profile)                    (详情核心)
Phase H   UserDetailPage Groups + Permissions tab + bulk action bar      (m2m + bulk)
Phase I   UserDetailPage API Token tab + TokenManageModal (avatar 下拉) (token UI)
Phase J   UserCreatePage                                                 (创建)
Phase K   Sidebar / Topbar 接线（删 admin 外链 + 加 /users 内链 + token 下拉项）
Phase L   playwright e2e + docs (api-reference + deploy doc)
```

每 phase 一组 commit，独立可回滚。

---

## 9. 验证矩阵 (Verification)

| Scope | Coverage |
|---|---|
| pytest | Phase A-E 每个 endpoint 至少一个 happy + 一个 unhappy + audit_log 写入断言 |
| pytest | 高危规则（删自己 / 删 superuser / 提权）每条独立 case |
| pytest | bulk-action 部分失败的 success/failed 数组形态 |
| Playwright | 列表分页 + 搜索 + 单个 filter |
| Playwright | 创建用户 → 列表中可见 → 编辑某字段 → save → 再次打开看到改动 |
| Playwright | Set password → 用新密码 login 成功（与 audit log e2e 同 round-trip pattern） |
| Playwright | Token rotate → 新 key 出现 → 用旧 key curl 失败 → 用新 key 成功 |
| Playwright | 自服务 token 在头像下拉里改完 → 新 key 出现 |
| Playwright | bulk delete 5 个 → 列表少 5 行 + audit_log 多 5 行 user_delete |
| 手动 smoke | 删自己按钮 disabled；非 superuser 看不到 is_superuser toggle |
| 手动 smoke | apiv2 token endpoints 仍正常使用（测试 token rotate 后 apiv2/cuckoo/status/ 用新 key 200） |

---

## 10. 风险 (Risks)

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| permission picker 量大（数百条）UX 卡顿 | 中 | 编辑慢 | content_type 折叠 + 默认全收起，按需展开 |
| bulk delete 误删 | 中 | 数据丢失 | confirm modal 必经，列出 username 让用户复核 |
| token rotate 后老集成卡死 | 低 | 用户慌 | UI 警示 "rotating token will revoke the existing key immediately" |
| 给自己删了所有 group 后丢访问权 | 低 | 锁外 | superuser 走 `/admin/` 兜底；普通 staff 删完自己后下次 login 仍看到 SPA 但功能受限 |
| 非 superuser 通过精心 PATCH 提权 | 低 | 严重 | view 内显式校验 `is_superuser` 字段，已有 testcase 锁住 |
| token endpoint 误把别人的 token 暴露给非 staff | 低 | 严重 | `IsAdminUser` permission_class + URL 内 user_id 检查 |
| 删 superuser 把自己变孤儿 | 极低 | 严重 | 后端 view 拒绝 + 前端 disable + 文档警示 |

---

## 11. 范围之外 (Out of Scope)

- multi-token-per-user / 命名 token / dj-rest-knox
- token TTL / expiry / refresh
- token IP allowlist / per-token scope
- 邮件邀请新用户流（POST /users/ 仍要求 password 上传时设）
- groups CRUD（创建 / 删除 / 改名 group 仍走 `/admin/auth/group/`）
- permissions CRUD（永远不在 SPA 内做 — Django auth 内置常量）
- 用户搜索的高级查询（regex / 复杂布尔），仅基础 `search` 子串模糊匹配
- 用户头像图片上传（继续用首字母）
- audit log 翻看时筛"对某个 user 的所有操作"（已通过 audit_log spec 的 `target_user` 实现，本次复用）

---

## 12. 文件清单 (Manifest)

| Path | 状态 | 估计行数 |
|---|---|---|
| `web/apiv3/views.py` | 修改：加 13 个 view 函数 | +650 |
| `web/apiv3/serializers.py` | 修改：加 ~10 个 serializer | +400 |
| `web/apiv3/urls.py` | 修改：加 14 条 path | +25 |
| `web/audit_log/__init__.py` | 修改：ACTIONS 加 9 项 | +9 |
| `tests/web/test_apiv3_users.py` | 新建：CRUD + bulk + 高危规则 | +500 |
| `tests/web/test_apiv3_users_m2m.py` | 新建：groups + permissions m2m | +200 |
| `tests/web/test_apiv3_users_token.py` | 新建：token CRUD（admin + self） | +200 |
| `frontend/app/src/lib/api/users.ts` | 新建 | +200 |
| `frontend/app/src/lib/api/groups.ts` | 新建 | +50 |
| `frontend/app/src/lib/api/permissions.ts` | 新建 | +50 |
| `frontend/app/src/lib/api/tokens.ts` | 新建 | +80 |
| `frontend/app/src/lib/query-keys.ts` | 修改：加 users / groups / permissions / tokens 键 | +20 |
| `frontend/app/src/hooks/useUsers.ts` | 新建 | +80 |
| `frontend/app/src/hooks/useUserDetail.ts` | 新建 | +50 |
| `frontend/app/src/hooks/useToken.ts` | 新建 | +50 |
| `frontend/app/src/routes/users.tsx` | 新建：UserListPage | +400 |
| `frontend/app/src/routes/users-new.tsx` | 新建：UserCreatePage | +200 |
| `frontend/app/src/routes/users-detail.tsx` | 新建：UserDetailPage 5 tab | +500 |
| `frontend/app/src/components/users/UserListTable.tsx` | 新建 | +200 |
| `frontend/app/src/components/users/UserFilterBar.tsx` | 新建 | +120 |
| `frontend/app/src/components/users/BulkActionBar.tsx` | 新建 | +120 |
| `frontend/app/src/components/users/SetPasswordModal.tsx` | 新建 | +130 |
| `frontend/app/src/components/users/GroupsPicker.tsx` | 新建 | +180 |
| `frontend/app/src/components/users/PermissionsPicker.tsx` | 新建 | +250 |
| `frontend/app/src/components/users/TokenSection.tsx` | 新建：复用于 admin 详情页 + 自服务 modal | +180 |
| `frontend/app/src/components/account/TokenManageModal.tsx` | 新建：avatar 下拉用 | +100 |
| `frontend/app/src/components/shell/Sidebar.tsx` | 修改：删 external admin + 加 internal /users | +5/-5 |
| `frontend/app/src/components/shell/Topbar.tsx` | 修改：加 "API token" 菜单项 + token modal state | +15 |
| `frontend/app/src/router.tsx` | 修改：注册 3 个新路由 | +10 |
| `frontend/app/tests/e2e/users-management.spec.mjs` | 新建：列表 + 创建 + 编辑 + bulk + token round-trip | +200 |
| `docs/web/api-reference.md` | 修改：加全部 14 个新 endpoint 章节 | +200 |
| `docs/web/deploy-192.168.1.6.md` | 修改：加部署记录 | +30 |

**总计**：~13 后端文件 + 17 前端文件 + 4 测试/文档文件，**约 5000 行净增**。

---

## 13. 关键交互决策（默认 — 已确认）

| 项 | 默认 |
|---|---|
| Token 模型 | DRF 默认 1-per-user |
| Token 显示 | UI 默认掩码 + Reveal 按钮（数据库本就明文存储，DRF 模型限制） |
| Token 轮转 | 单按钮 "Rotate" = atomic delete + create；返回新 key 一次 |
| 创建用户密码 | 必填（同 Django admin） |
| 删自己 | 后端拒绝 + 前端按钮 disabled |
| 删 superuser | 仅 superuser 才能删 |
| is_superuser toggle | 仅 superuser UI 可见 |
| Bulk delete | 支持，confirm modal 必经，列出 username |
| Permissions picker | 按 content_type 分组的折叠树 |
| 分页 | 20/page，cursor-based（与 audit_log 一致） |

---

## 14. 跟既往 spec 的关系

- `2026-05-01-audit-log-design.md` — 提供了审计 backbone（ACTIONS + audit.log helper + signals）。本 spec 复用，加 9 个 ACTION。
- `2026-05-02-user-management-design.md` — 自服务 profile + 改密 + sidebar Users 外链。本 spec 删 sidebar 外链 + 加 token 自服务下拉项；profile / 改密 modal 不变。
- 当前 SPA infrastructure（Dialog / Toast / api client pattern / TanStack Query / staffOnly NavItem）已建好，本 spec 仅新增 3 个路由 + 一组 components。
