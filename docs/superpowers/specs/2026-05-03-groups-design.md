# Sub-spec #2 — `/groups` SPA + apiv3 Group CRUD 设计

**Status:** approved-pending-spec-review
**Date:** 2026-05-03
**Branch:** refactor/web-spa
**Builds on:** sub-spec #1 (auth-strip, commit `66f72b51`) — `/admin/auth/group/` 已 unregister；本 spec 把 group CRUD 全面接进 SPA。

---

## 1. Understanding Summary

- **目标**：把 `/admin/auth/group/` 的全部能力（list / create / rename / delete / 改 permissions）以 SPA 路由 `/groups` 实现，外加 admin 视角的"看哪些 user 在这个 group 里" + 双向 m2m 编辑（从 group 一侧加/移 user）。
- **谁用**：is_staff 用户，做权限组运维。
- **配合 sub-spec #1**：admin 已经 unregister Group，所以 `/admin/auth/group/` → 404；唯一 group 管理入口是 SPA `/groups`。
- **配合 sub-spec #4**：`/users/<id>/Groups` tab 仍然存在（user 一侧加/移 group），跟本 spec 的 `/groups/<id>/Members` tab 互为反向 m2m 视图。
- **关键非目标**：不扩展 Group 模型本身（Django 内置只有 id + name + permissions m2m）；不做 group 嵌套、描述字段、按 permission 反查 group 等。

## 2. Assumptions

1. Django 内置 `auth.Group` 模型保持 schema 不变。新加字段意味着 migration，跨 sub-spec 风险。
2. 删 group 时 Django ORM 默认行为 = 自动断 user.groups m2m 关联（user 本身保留）。**接受此默认**；不用软删。
3. **`PermissionsPicker` 组件需要从受控前重构为受控** —— 当前它内部管 dirty + Save 按钮 + 自己 PATCH /users/<id>/permissions/。改造后变成纯 UI（接 `value: number[]` + `onChange`），父组件管 mutation。/users/<id>/Permissions tab 同 commit 内迁移到新 API。
4. Sidebar Admin section 顺序：`Audit · Users · Groups · API Docs`（Q-2 用户确认）。
5. 创建 / 编辑 / 删除 group 都通过 apiv3，触发显式 `audit.log()` 调用。
6. Group name 在 DB 层有 `unique=True` 约束（Django 内置）。前端 + 后端双重校验，前端给即时反馈。

## 3. 架构

```
SPA (3 个新路由)
  /groups               GroupListPage    搜索 + cursor 分页 + bulk delete
  /groups/new           GroupCreatePage  名字 + 初始 permissions 可选
  /groups/<id>          GroupDetailPage  2 tab:
                          • Basic    rename + permissions m2m picker
                          • Members  user 反向 m2m (add/remove user from group)

apiv3 (8 个 endpoint，全部 IsAdminUser)
  GET    /api/v3/groups/                  list (扩展现有)
  GET    /api/v3/groups/<id>/             detail
  POST   /api/v3/groups/                  create
  PATCH  /api/v3/groups/<id>/             rename + permissions m2m
  DELETE /api/v3/groups/<id>/             delete
  POST   /api/v3/groups/bulk-delete/      bulk delete
  GET    /api/v3/groups/<id>/members/     users in group (paginated)
  PATCH  /api/v3/groups/<id>/members/     replace member m2m

Sidebar Admin
  ... Audit → Users → Groups (新) → API Docs

Audit
  3 新 ACTION: group_create / group_update / group_delete
```

## 4. 后端 apiv3 详表

### 4.1 `GET /api/v3/groups/` (扩展现有)

**当前形态** (来自 spa-user-management spec)：返回 `{data: [{id, name, permission_count}]}`，不分页。

**新增**：
- 返回每行 `member_count`（user_set m2m 计数）
- 支持 `?search=<name-icontains>` filter
- 支持 cursor pagination：`?cursor=&limit=`，max limit 100，默认 20
- 同形态：`{data: [...], next_cursor: <id|null>, total: <int>}`（与 /api/v3/users/ 一致）

**SerializerExtension**：
```python
class GroupListSerializer(serializers.ModelSerializer):
    permission_count = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ("id", "name", "permission_count", "member_count")

    def get_permission_count(self, obj):
        return obj.permissions.count()

    def get_member_count(self, obj):
        return obj.user_set.count()
```

### 4.2 `GET /api/v3/groups/<id>/`

```json
{ "id": 1, "name": "moderators", "permission_ids": [12, 34, 56], "member_count": 3 }
```

新 `GroupSerializer`（不含 list 用的 counts，只 permission_ids）。

### 4.3 `POST /api/v3/groups/`

**Request**:
```json
{ "name": "moderators", "permission_ids": [12, 34] }
```

`permission_ids` 可选（默认 `[]`）。`name` 必填、唯一。

**Validation**:
- name 长度 1-150（Django 默认）
- name 唯一（`Group.objects.filter(name=...).exists()` 拒）
- permission_ids 中无效 id 静默丢弃（不报错）

**Response**: 201 with `GroupSerializer` (full detail) shape.

**Audit**: `group_create` (target_type="group", target_label=name).

### 4.4 `PATCH /api/v3/groups/<id>/`

**Request** (任一字段可选)：
```json
{ "name": "newname", "permission_ids": [12, 34, 56] }
```

**Validation**:
- 改名时 name 唯一性校验（exclude 自己）
- permission_ids 给则 replace m2m

**Audit**: `group_update`，metadata `{fields: [<changed>], permissions_changed: bool}`. Fields 列表用法跟 user_update 一致。

### 4.5 `DELETE /api/v3/groups/<id>/`

直接调 `group.delete()`（CASCADE m2m 关联）。`audit.log("group_delete", target_label=group.name)`. 204.

### 4.6 `POST /api/v3/groups/bulk-delete/`

```json
{ "ids": [1, 2, 3] }
```

返回:
```json
{ "success": [1, 2], "failed": [{"id": 3, "reason": "not found"}] }
```

每成功一行单独 emit `group_delete` audit row。

### 4.7 `GET /api/v3/groups/<id>/members/`

```json
{
  "data": [<UserListSerializer rows>],
  "next_cursor": <int|null>,
  "total": <int>
}
```

复用 `UserListSerializer`（已有），`?cursor=&limit=` 支持。order: by username asc。

### 4.8 `PATCH /api/v3/groups/<id>/members/`

**Request**:
```json
{ "user_ids": [4, 5, 12, 33] }
```

Replace `group.user_set` m2m。无效 user_id 静默丢弃。

**Audit**: `group_update`，`metadata.members_changed: true`. (与 permissions_changed 同形态)

## 5. 审计 (Audit)

3 个新 ACTION，加进 `web/audit_log/__init__.py`：
```python
("group_create",  "Group Created",  "user_mgmt"),
("group_update",  "Group Updated",  "user_mgmt"),
("group_delete",  "Group Deleted",  "user_mgmt"),
```

每个 mutation 显式 `audit.log()` (target_type="group" / target_id / target_label=name)。

## 6. 前端

### 6.1 受控化重构 `PermissionsPicker.tsx`

当前 (spa-user-management spec G2):
```tsx
<PermissionsPicker user={user} />
// internally fetches, manages dirty/Save, PATCH /users/<id>/permissions/
```

改为受控形式：
```tsx
<PermissionsPicker
  value={permissionIds}                      // current selected ids
  onChange={(ids) => setPermissionIds(ids)}  // up to caller to save
  // optional: disabled, loading from caller
/>
```

父组件（UserDetailPage Permissions tab + GroupCreatePage + GroupDetailPage Basic tab）各自管 dirty 状态 + Save 时机 + mutation。

**改造范围**：
- `PermissionsPicker.tsx` 内部去掉 useMutation + dirty 检测；只保留 `useQuery(listPermissions)` + 折叠树 UI
- 父组件 `routes/users-detail.tsx` 的 Permissions tab 改为：拿 `user.permission_ids` → useState + 自管 mutation + Save 按钮

类似 react-hook-form 的"controlled component"模式。

### 6.2 GroupListPage (`routes/groups.tsx`)

复用 `/users` 列表的所有模式 (FilterBar + Table + BulkActionBar + cursor pagination + StaffOnly gate)。

字段表头：`☐ | Name | Members | Permissions`

只读列；点行跳 `/groups/<id>`. Bulk action bar 仅 Delete 一项（vs /users 有 Activate/Deactivate/Delete）。

### 6.3 GroupCreatePage (`routes/groups-new.tsx`)

```
Crumbs: ... > Groups > New
┌──────────────────────────────────────────────────────────────┐
│ Name * [moderators                  ]   <inline error>       │
│                                                              │
│ Permissions:                                                  │
│   <PermissionsPicker value={...} onChange={...} />           │
│                                                              │
│             [Cancel] [Create group]                          │
└──────────────────────────────────────────────────────────────┘
```

POST 成功 → invalidate groups.all + navigate `/groups/<new_id>`.

### 6.4 GroupDetailPage (`routes/groups-detail.tsx`)

```
Crumbs: ... > Groups > moderators              [Save] [Delete]
┌──────────────────────────────────────────────────────────────┐
│ [Basic]  [Members]                                           │
├──────────────────────────────────────────────────────────────┤
│ Basic tab:                                                    │
│   Name * [moderators                  ]                      │
│   Permissions: <PermissionsPicker>                           │
│   [Save basic]                                                │
│                                                              │
│ Members tab:                                                  │
│   <UsersInGroupPicker groupId={id} />                         │
└──────────────────────────────────────────────────────────────┘
```

### 6.5 `UsersInGroupPicker.tsx` 新组件

双列 m2m picker：
- 左侧：当前 `members` (从 `GET /groups/<id>/members/` 拉)
- 右侧："other users" (从 `GET /users/?limit=...` 拉，过滤掉已是 member 的)
- 中间：`>` `<` 按钮把 user 在两侧来回搬
- 上方搜索框：搜索 username（左/右两侧都过滤）
- 底部：[Save members] —— PATCH /api/v3/groups/<id>/members/ with `user_ids: [...]`

数据量考虑：本部署用户数预期 < 100，无需分页；UsersInGroupPicker 拉 `GET /users/?limit=200`（足够）+ `GET /groups/<id>/members/` 一次。

估行数 ~250 行。

### 6.6 API client + hooks

新增到 `lib/api/groups.ts` (现 50 行扩展到 ~200 行)：
```ts
export interface GroupListRow { id, name, permission_count, member_count }
export interface GroupDetail { id, name, permission_ids[], member_count }
export interface GroupListFilters { search?, cursor?, limit? }

listGroups(filters): Promise<{data, next_cursor, total}>
getGroup(id): Promise<GroupDetail>
createGroup({name, permission_ids?}): Promise<GroupDetail>
updateGroup(id, {name?, permission_ids?}): Promise<GroupDetail>
deleteGroup(id): Promise<void>
bulkDeleteGroups(ids): Promise<{success, failed}>
getGroupMembers(id, {cursor, limit}): Promise<UserListResponse>
setGroupMembers(id, user_ids): Promise<GroupDetail>
```

`useGroups.ts` hook：`useGroupsInfinite(filters)` + `useGroupDetail(id)` + `useGroupMembers(id)`.

`queryKeys.groups` 扩展：`detail(id)` + `members(id)`.

## 7. Sidebar / Icon

### Sidebar `frontend/app/src/components/shell/Sidebar.tsx`

ADMIN_ITEMS 改为：
```ts
{ to: "/audit", label: "Audit", icon: Icon.doc, staffOnly: true },
{ to: "/users", label: "Users", icon: Icon.users, staffOnly: true },
{ to: "/groups", label: "Groups", icon: Icon.groupsRound, staffOnly: true },  // 新
{ to: "/docs", label: "API Docs", icon: Icon.doc },
```

### Icon (`frontend/app/src/components/shell/icons.tsx`)

加 `UsersRound` 别名为 `Icon.groupsRound`：
```ts
import { ..., UsersRound } from "lucide-react";
...
groupsRound: UsersRound,
```

## 8. 验证矩阵

### 8.1 pytest (~30 case)

| File | 内容 | Case |
|---|---|---|
| `tests/web/test_apiv3_groups_serializers.py` | GroupListSerializer / GroupSerializer 形态锁定 | 3 |
| `tests/web/test_apiv3_groups_list.py` | GET 列表 + search + pagination + 403 / 401 | 6 |
| `tests/web/test_apiv3_groups_detail.py` | GET <id> 形态 + 404 | 3 |
| `tests/web/test_apiv3_groups_create.py` | 创建 + 唯一性 + 403 / audit | 5 |
| `tests/web/test_apiv3_groups_update.py` | PATCH name + permissions + audit + 唯一性冲突 | 5 |
| `tests/web/test_apiv3_groups_delete.py` | 删 + 解除 m2m + audit + bulk | 5 |
| `tests/web/test_apiv3_groups_members.py` | GET members + PATCH members + audit | 4 |

### 8.2 Playwright e2e

新 spec `tests/e2e/groups-management.spec.mjs`，测试：
1. `/groups` list 渲染 + 搜索
2. 创建 group `e2e-grp-tmp` → 编辑 → 加 permission → 加 member → 删除（idempotent round-trip）
3. Sidebar Groups 链接对 staff 可见 + href = `/groups`

### 8.3 Regression

跑既有全套 e2e（21 个）+ pytest（确保 PermissionsPicker 受控化重构没破坏 /users/<id>/Permissions tab）。

## 9. 边缘 case

| Case | 处理 |
|---|---|
| 删 group 时 group.user_set 不空（有成员） | Django CASCADE 自动断 m2m，user 不删；前端 confirm 显示 "<N> users will be removed from this group" |
| Group rename 与现有 group 撞 | 后端 IntegrityError → 400 `{name: ["already exists"]}` |
| 创建空 name | serializer required=True + max_length=150 校验 |
| Members tab 编辑后立即 save vs dirty + Save | dirty + Save（与 /users/<id>/Groups 一致）|
| 删 group 后还在 detail 页 | navigate("/groups") + showToast |
| /users/<id>/Permissions tab 受控化迁移引入 bug | 同 commit 内迁移 + Playwright e2e gate |
| Permissions m2m 数据量 (Django auth 默认 ~50 个 + 第三方 app permissions) | PermissionsPicker 已经做内容类型折叠，500 个也可用 |

## 10. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `PermissionsPicker` 受控化重构破坏 /users/<id>/Permissions tab | 中 | UX 回归 | 同 commit 内迁移 + e2e users-management.spec.mjs 仍跑通 |
| 删 group 时大量 m2m row 删除（user_groups 表）可能锁表 | 低 | 短暂性能 | Django CASCADE 默认事务；接受 |
| 创建 group 时同名并发 (admin 1 + admin 2 同时建 "x") | 极低 | IntegrityError → 一方 400 | DB 唯一约束 + 前端重试 |
| Members tab 编辑某 user 同时 user 详情页删该 user | 低 | PATCH `user_ids: [...]` 含已删 id → 静默丢弃 | 后端 filter id__in=valid_ids |

## 11. 范围之外

- Group 嵌套 / hierarchy
- Group description / notes 字段（需要 model 改）
- 按 permission 反查 group 列表
- Group 模板 / 复制
- Group 配额（max members / max permissions）
- group rename 后历史 audit_log 行的回填（保留旧 name；audit metadata 已存 target_label snapshot）

## 12. 文件清单

| Path | 状态 | 估行 |
|---|---|---|
| `web/audit_log/__init__.py` | 修改：+3 ACTIONS | +3 |
| `web/apiv3/serializers.py` | 修改：扩展 GroupSerializer + GroupListSerializer + GroupCreate/Update | +90 |
| `web/apiv3/views.py` | 修改：扩展 groups_list + 加 groups_detail + groups_create + groups_update + groups_delete + groups_bulk_delete + groups_members + groups_set_members | +400 |
| `web/apiv3/urls.py` | 修改：+8 路由 | +10 |
| `tests/web/test_apiv3_groups_*.py` | 7 个新文件 | +500 |
| `frontend/app/src/lib/api/groups.ts` | 修改：+5 个新函数 + 类型 | +120 |
| `frontend/app/src/lib/query-keys.ts` | 修改：扩展 groups 键 | +5 |
| `frontend/app/src/hooks/useGroups.ts` | 新建 | +60 |
| `frontend/app/src/components/users/PermissionsPicker.tsx` | **重构为受控** | -50/+30 |
| `frontend/app/src/routes/users-detail.tsx` | 修改：Permissions tab 接管 dirty + save | +30 |
| `frontend/app/src/routes/groups.tsx` | 新建：list page | +250 |
| `frontend/app/src/routes/groups-new.tsx` | 新建：create page | +180 |
| `frontend/app/src/routes/groups-detail.tsx` | 新建：detail page (2 tab shell + Basic) | +280 |
| `frontend/app/src/components/groups/UsersInGroupPicker.tsx` | 新建：双列 m2m | +250 |
| `frontend/app/src/components/groups/GroupFilterBar.tsx` | 新建（仅 search 输入） | +60 |
| `frontend/app/src/components/groups/GroupListTable.tsx` | 新建 | +80 |
| `frontend/app/src/components/groups/BulkDeleteBar.tsx` | 新建（专门给 groups 用，单 action delete） | +60 |
| `frontend/app/src/components/shell/Sidebar.tsx` | 修改：+ Groups 项 + staffOnly gate | +5 |
| `frontend/app/src/components/shell/icons.tsx` | 修改：+ groupsRound 图标 | +3 |
| `frontend/app/src/router.tsx` | 修改：+ 3 路由 | +6 |
| `frontend/app/tests/e2e/groups-management.spec.mjs` | 新建 | +120 |
| `docs/web/api-reference.md` | 修改：+ Groups section (8 endpoint) | +80 |
| `docs/web/deploy-192.168.1.6.md` | 修改：+ sub-spec #2 部署记录 | +30 |

**总计**：~6 后端 + 14 前端 + 1 测试 + 2 文档，**约 2700 行净增 + ~50 行 PermissionsPicker 重构**。

## 13. 实现顺序 (Phase 切分)

```
Phase A   audit ACTIONS + Group serializers + GET 扩展 + GET <id>/                  backend
Phase B   POST + PATCH + DELETE /api/v3/groups/<id>/                                 backend
Phase C   bulk-delete + members GET + members PATCH                                  backend
─── BACKEND DONE，pytest 全绿 ───
Phase D   API client lib/api/groups.ts 扩展 + hooks + Sidebar Groups 入口
Phase E   PermissionsPicker 受控化重构 + /users/<id>/Permissions tab 接管 mutation
Phase F   GroupListPage + GroupFilterBar + GroupListTable + BulkDeleteBar
Phase G   GroupCreatePage
Phase H   GroupDetailPage shell + Basic tab
Phase I   Members tab + UsersInGroupPicker
Phase J   playwright e2e + api-reference + deploy doc
```

10 phase。每 phase 独立 commit，可回滚。

## 14. Decision Log

| 决定 | 备选 | 理由 |
|---|---|---|
| Members tab 走双向 m2m picker (从 group 一侧加/移 user) | 仅只读列表 + 跳 /users/<id>/Groups | 运维场景常见"批量加 user 进新 group" |
| `PermissionsPicker` 重构为受控组件 | 复制一个 picker for groups | DRY；同 commit 迁移 /users/<id>/Permissions tab |
| Bulk delete 支持 | 仅单删 | 与 /users 一致，运维清理高频 |
| Group rename 用 PATCH 而非 PUT | PUT (full replace) | RESTful 上 PATCH 更准（部分更新）；与 /users PATCH 一致 |
| Sidebar 顺序 Audit · Users · Groups · API Docs | Users · Groups · Audit · API Docs | 用户 Q-2 选定；Audit 最常用放最上 |
| Members tab vs 单页长 form | 多 tab | 与 /users/<id> 多 tab 风格一致 |
| 创建 group 时 permission_ids 可选 | 必填 | 大部分 group 先建后配 |
| 删 group 时不阻拦 (即使有 N members) | 阻拦或 cascade 失败 | Django 默认 m2m CASCADE 自动断；user 本身不删 |
| 反向 m2m 用 `group.user_set` 而非新加 group_members 字段 | 自定义模型 | 用 Django 内置反向 m2m，无 schema 改 |
| Group icon 用 lucide UsersRound | 复用 Icon.users | 视觉与 Users 区分 |

## 15. 跟既往 spec 的关系

- `2026-05-01-audit-log-design.md`：本 spec 加 3 ACTIONS，沿用既有 helper / signals。
- `2026-05-03-spa-user-management-design.md`：本 spec 复用 `UserListSerializer`（GroupMembers）+ `PermissionsPicker`（组件，受控化后）；扩展 `lib/api/groups.ts` 现有的 listGroups 函数。
- `2026-05-03-auth-strip-design.md`：本 spec 假定 `/admin/auth/group/` 已 unregister；admin 不再有任何 group 入口；SPA 的 `/groups` 是唯一入口。
- 未来 sub-spec #3 (`/tokens` admin)：与本 spec 平行，互不依赖。
- 未来 sub-spec #4 (`/users` History + username editable)：与本 spec 平行；但 PermissionsPicker 受控化（Phase E）会先于 sub-spec #4 落地，sub-spec #4 不需要再触 picker。
