# Sub-spec #8 — 剥离 RBAC：单一 superuser 权限模型 + /users/<id> 单页 + /tokens 部分回退

**Status:** approved-pending-spec-review
**Date:** 2026-05-06
**Branch:** refactor/web-spa
**Builds on / Reverses:**
- sub-spec #1 (auth-strip) —— 保留；本 spec 在其基础上进一步收口
- sub-spec #2 (/groups SPA + apiv3 group CRUD) —— **完全删除**（前后端 + 测试 + audit ACTIONs）
- sub-spec #4 (/users/<id> History tab) —— **完全删除**
- sub-spec #7 (/tokens Token-as-primary 重构) —— **部分回退**（恢复"每 user 一行" + Generate 入口；保留 mono mask + reveal + copy + Modal 的视觉与组件）

---

## 1. Understanding Summary

- **目标**: 把 CAPE 的授权简化为二元模型：`is_superuser=True` 的"最高管理员" 与普通用户。删除 Django auth.Group / auth.Permission 在产品层的所有使用；删除 `UserProfile` 模型；折叠 `/users/<id>` 详情页为单页；恢复 `/tokens` 的 Generate 入口（sub-spec #7 把它移走后，admin 创建用户后没有签发 token 的路径，必须回补）。
- **谁用**: 一个或多个 superuser（admin 类）+ 任意数量普通用户（API 提交样本/查看自己结果）。
- **关键非目标**:
  - 不删除 Django 内置 `auth.Group` / `auth.Permission` / `auth_user.is_staff` 表 / 字段（深 migration 风险）
  - 不删除 audit_log 已写入的历史记录（保留 `group_*` 历史行；只停止再写）
  - 不改 apiv2 token-based 接口的 `IsAuthenticated` 行为（API 客户端仍按 token 鉴权，限流改全局）

## 2. Assumptions

1. 240 上数据：1 user (superuser+staff)、0 groups、0 m2m perms、1 UserProfile row（admin signal-created）。删表迁移零业务影响。
2. `is_staff` 字段不在前端单独 UI 暴露，但在后端 `auto-sync`：每次写 `is_superuser=True` 时同步 `is_staff=True`（保留 Django admin 兼容性）。
3. `api.conf [api] default_subscription_ratelimit` 已存在，作为 apiv2 throttling 的全局 fallback。
4. `web.conf [general] reports_dl_allowed_to_all` 已存在，作为报告下载的全局开关。
5. `PermissionsPicker.tsx` / `GroupsPicker.tsx` / `TokenSection.tsx` / `HistoryTab.tsx` 目前仅 `/users/<id>` 详情页使用，删除是局部隔离的。
6. 保留 sub-spec #7 的 `TokenRevealDialog` 组件 + reveal/copy/mask 视觉，仅恢复 sub-spec #3 的列表语义（每 user 一行）+ Generate 内联回调。

## 3. 架构

```
SPA (大量删除)
  /groups, /groups/new, /groups/:id        全部删除
  /users/<id>                              单页化（删 5 tab + tab UI 框架）
  /tokens                                  改回 1 row=1 user，无 token 行显示 [Generate]
  Sidebar Admin                            删 Groups 链接（剩 Users / Tokens / API Docs）

apiv3 (大量删除)
  groups/, groups/<id>/, groups/bulk-delete/, groups/<id>/members/   全部删除
  permissions/                                                       全部删除
  users/<id>/groups/, users/<id>/permissions/                        全部删除
  users/                                                             删 is_staff 字段写入；is_superuser 时联动 is_staff
  users/<id>/                                                        响应去掉 groups/permissions/userprofile 字段
  tokens/                                                            恢复 sub-spec #3 列表语义；保留 sub-spec #7 的 key 字段返回
  me/                                                                响应去 subscription / reports_dl_allowed

backend
  web/users/models.py                      删 UserProfile 类 + signal
  web/apiv3/permissions.py                 新增 IsSuperUser
  web/apiv3/views.py                       16 处 IsAdminUser → IsSuperUser
  web/apiv2/throttling.py:33               userprofile.subscription → 全局 default_subscription_ratelimit
  web/analysis/views.py:391                删 userprofile.reports 检查
  web/apiv2/views.py:1105                  删 userprofile.reports 检查
  Django migration                         drop users_userprofile 表 + 反向 OneToOne 关联

audit
  ACTIONS                                  删 group_create / group_update / group_delete 3 项

测试
  tests/web/test_apiv3_groups_*.py         删（5 文件）
  tests/web/test_apiv3_group_serializers.py 删
  tests/web/test_apiv3_users_*.py          调整（去 groups/permissions/userprofile 断言）
  tests/web/test_apiv3_user_serializers.py 调整
  tests/web/test_apiv3_me_view.py          调整（去 subscription/reports_dl_allowed）
  e2e groups-management.spec.mjs           删
  e2e users-management.spec.mjs            调整（去 tab 切换；去 Groups/Permissions/Profile 流；token 改走 /tokens）
  e2e tokens-management.spec.mjs           调整（test 4: Revoke 后 row 不消失而是变 Generate 状态）

文档
  docs/web/api-reference.md                删 Groups + Permissions section
  docs/web/deploy-192.168.1.6.md           可保留历史
```

## 4. 后端

### 4.1 新建 `IsSuperUser` permission class

`web/apiv3/permissions.py` 追加：

```python
from rest_framework.permissions import BasePermission


class IsSuperUser(BasePermission):
    """The single highest-admin gate after sub-spec #8 collapsed RBAC.

    Replaces all uses of DRF's built-in IsAdminUser (which checks
    is_staff). After sub-spec #8 there is exactly one privilege level:
    is_superuser=True. is_staff stays bound to is_superuser for Django
    admin compatibility but no longer carries independent meaning.
    """

    message = "Superuser privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )
```

### 4.2 替换 `IsAdminUser` → `IsSuperUser`

`web/apiv3/views.py` 中 16 处 `@permission_classes([IsAdminUser])` 全部改为 `@permission_classes([IsSuperUser])`。导入也相应替换。

### 4.3 删除 group / permission 端点 + serializer

删除 views：`groups_list`, `groups_detail`, `groups_bulk_delete`, `groups_members`, `permissions_list`, `users_set_groups`, `users_set_permissions`。

删除 urls.py 对应 7 行 path。

删除 serializers.py：`GroupListSerializer`, `GroupDetailSerializer`, `GroupCreateSerializer`, `GroupUpdateSerializer`, `PermissionSerializer`（如有）。

### 4.4 收口 `is_staff` 行为

`UserCreateSerializer` 与 `UserUpdateSerializer`：
- 删除 `is_staff` 字段（同时从 `to_internal_value` allowed set 中移除）
- 保留 `is_superuser` 字段
- `validate()` 中如果 `attrs["is_superuser"] is True` 且当前请求方非 superuser → 已有的 `is_superuser` 校验保持

`web/apiv3/views.py` `users_list` POST + `users_detail` PATCH：
- 写 `is_superuser` 时同步设置 `is_staff` 为同值：

```python
if "is_superuser" in validated:
    user.is_superuser = validated["is_superuser"]
    user.is_staff = validated["is_superuser"]  # auto-sync for Django admin
```

`UserSerializer` 响应：保留 `is_superuser` 字段；保留 `is_staff` 字段（只读，避免破坏外部 API 消费者，但不在前端 UI 显示）。

### 4.5 `users_detail` 删 m2m 字段

`UserSerializer` 删字段：`groups`, `user_permissions`, `permission_count`, `permission_ids`, `group_count`, `group_ids`。`users_detail` GET 响应去掉这些字段。

### 4.6 `/tokens` 后端回退

`tokens_list` view body 改回不强制过滤：

```python
qs = User.objects.select_related("auth_token").order_by("id")
# search filter unchanged
# NO has_token__isnull filter — return all users
```

`extend_schema` description 同步：list 返回所有 user，含 token 的有 `key`，无 token 的 `key=null`。

`TokenAdminListItemSerializer.get_key` 不变（已用 `try/except` 安全访问）。

### 4.7 删 UserProfile

`web/users/models.py`：删除 `UserProfile` 类 + `create_or_update_user_profile` signal。

新建 Django migration：

```python
# web/users/migrations/0XXX_drop_userprofile.py
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("users", "<previous_migration_name>"),
    ]
    operations = [
        migrations.DeleteModel(name="UserProfile"),
    ]
```

`web/apiv3/serializers.py`：删 `UserProfileNestedSerializer` + `UserSerializer.subscription / reports_dl_allowed` + `UserUpdateSerializer.userprofile` nested + `UserSerializer.fields` 列表对应字段。

`web/apiv3/views.py`：`me` 视图响应删 `subscription / reports_dl_allowed`；`users_detail` PATCH 删 `profile_data` 处理 + nested write。

`web/apiv2/throttling.py:33` 改：

```python
# Before
if request.user.userprofile.subscription:
    requests, duration = self.parse_rate(request.user.userprofile.subscription)

# After
default = api_cfg.api.default_subscription_ratelimit  # already in settings
if default:
    requests, duration = self.parse_rate(default)
```

`web/analysis/views.py:391`、`web/apiv2/views.py:1105`：删 `not request.user.userprofile.reports` 条件，仅保留 `web_cfg.general.reports_dl_allowed_to_all` 全局判断。

`web/apiv3/views.py:179` 删除 `subscription` 与 `reports_dl_allowed` 两个 me 响应字段。

### 4.8 audit ACTIONs 清理

`web/audit_log/__init__.py` 中删 `group_create`, `group_update`, `group_delete` 3 行。已写入的 audit_log 行保留（不做 SQL 清理）。

## 5. 前端

### 5.1 删除文件清单

```
frontend/app/src/routes/groups.tsx                       删
frontend/app/src/routes/groups-new.tsx                   删
frontend/app/src/routes/groups-detail.tsx                删
frontend/app/src/components/groups/                      整目录删（所有 .tsx）
frontend/app/src/hooks/useGroups.ts                      删
frontend/app/src/lib/api/groups.ts                       删
frontend/app/src/components/users/HistoryTab.tsx         删
frontend/app/src/components/users/TokenSection.tsx       删（移走逻辑去 /tokens）
frontend/app/src/components/users/PermissionsPicker.tsx  删
frontend/app/src/components/users/GroupsPicker.tsx       删
```

### 5.2 修改文件清单

```
frontend/app/src/router.tsx                              删 3 个 /groups 路由
frontend/app/src/components/shell/Sidebar.tsx            删 Groups NavItem
frontend/app/src/lib/api/users.ts                        删 setUserGroups, setUserPermissions
frontend/app/src/lib/query-keys.ts                       删 groups: {} 整段
frontend/app/src/routes/users-detail.tsx                 重写为单页（删 TABS / tab UI / 5 个 sub-component）
frontend/app/src/routes/users-new.tsx                    删 is_staff 复选框
frontend/app/src/components/tokens/TokenListTable.tsx    无 token 行渲染 [Generate] 按钮
frontend/app/src/routes/tokens.tsx                       重新引入 onGenerate（confirm + rotateUserToken + RevealDialog）
frontend/app/src/lib/api/tokens.ts                       AdminTokenRow.has_token 重新有意义
```

### 5.3 `routes/users-detail.tsx` 单页化

Basic 区域字段（与现有 `BasicTab` 内容一致，删除 is_staff 行）：
- Username（readonly）
- Email
- First name / Last name
- Active toggle（除自己外）
- **Superuser toggle**（仅当前请求方为 superuser 时可见）
- Save button
- Set password button（弹现有 SetPasswordModal）
- Delete user button（除自己外）

整页布局：
- `<PageHead crumbs={["CAPE", "Admin", "Users", user.username]} />`
- 直接渲染 Basic 字段表单，不再有 `<TABS>` 切换

### 5.4 `/tokens` 前端回退

`TokenListTable.tsx`：
- 当 `row.key === null` 时，Token 列显示 `<span className="dim">⊘ None</span>`，Actions 列显示 `[Generate]`
- 当 `row.key !== null` 时，保持 sub-spec #7 的 mono mask + 👁 reveal + 📋 copy + Actions `[Rotate] [Revoke]`

`routes/tokens.tsx`：
- 加回 `onGenerate(row)` 回调（confirm → rotateUserToken → 成功 → 弹 RevealDialog）
- 已有的 onRotate / onRevoke 不变；onRevoke 后 invalidate 触发列表重拉，该行自动变成无 token 状态（不再 toBeHidden）

`TokenFilterBar.tsx`：当前已是 search-only（sub-spec #7 简化过），保持不变。

### 5.5 Sidebar 清理

`components/shell/Sidebar.tsx` 中 `ADMIN_ITEMS` 数组删除：

```typescript
{ to: "/groups", label: "Groups", icon: Icon.groupsRound, staffOnly: true },
```

### 5.6 router.tsx 清理

删 3 个路由 entry：`groups`, `groups/new`, `groups/:id`，及对应 lazy import。

## 6. 权限 / 安全

- 新建 `IsSuperUser` permission class 替换 `IsAdminUser`
- 后端依然校验 `request.user.is_superuser`；`is_staff=True` 是后端联动结果，前端不暴露切换
- API 客户端（apiv2 token-based）继续 IsAuthenticated 模式不变
- 普通用户（非 superuser）：能登录 SPA dashboard / submit、看自己的 task；不能进 /users / /tokens（页面级 staffOnly gate 触发跳转 + apiv3 endpoint IsSuperUser 兜底 403）

## 7. Audit

删 3 个 group_* ACTIONs。token / user / login / password / token_rotate / token_revoke / user_create / user_update / user_delete / user_activate / user_deactivate 等保留。已有 audit log 数据库行（含 group_* 历史）保留。

## 8. 测试策略

### 8.1 后端 pytest

**删除文件（5+ 个）：**
- `tests/web/test_apiv3_groups_list_extended.py`
- `tests/web/test_apiv3_groups_detail.py`
- `tests/web/test_apiv3_groups_create.py`
- `tests/web/test_apiv3_groups_update.py`
- `tests/web/test_apiv3_groups_delete.py`
- `tests/web/test_apiv3_groups_members.py`
- `tests/web/test_apiv3_groups_permissions.py`
- `tests/web/test_apiv3_group_serializers.py`

**调整文件：**
- `test_apiv3_users_list.py` / `test_apiv3_users_create.py` / `test_apiv3_users_update.py` / `test_apiv3_users_detail.py` / `test_apiv3_users_simple_mutations.py` / `test_apiv3_users_bulk.py` —— 去 groups/permissions/userprofile 断言；去 is_staff 字段断言；新增 "writing is_superuser=True syncs is_staff=True" 测试
- `test_apiv3_user_serializers.py` —— 同上
- `test_apiv3_me_view.py` —— 删 subscription/reports_dl_allowed 字段断言
- `test_apiv3_me_update.py` / `test_apiv3_password_change*.py` —— 不变
- `test_apiv3_tokens_list.py` —— 测试 "only returns users with tokens" 改回 "returns all users" + key field 在有 token 行非 null

### 8.2 前端 e2e

**删除文件：**
- `frontend/app/tests/e2e/groups-management.spec.mjs`

**调整文件：**
- `users-management.spec.mjs` —— 去 tab 切换 / "API Token" tab 流；token 改走 /tokens 页；admin token 测试改 verify /tokens row
- `tokens-management.spec.mjs`：
  - 测试 2 sub-spec #7 期望 admin row 总有 token；本 sub-spec 仍保持 admin 自身有 token 的前提
  - 测试 4 "Revoke 后 row 消失" → 改为 "Revoke 后 row 仍存在但 Token 列变 ⊘ None + Actions 显示 [Generate]"
  - 新增（如可）"Generate on no-token row → RevealDialog → row 变 has_token 状态"

### 8.3 数据 / 兼容回归

- 部署后：admin 进 SPA →
  - Sidebar 不再有 Groups
  - /users/<id> 单页（无 tab）
  - /tokens 列出所有 user，admin 自身有 mono token，其他 user（如有）显示 [Generate]
  - 普通用户（如新建一个）登录后侧栏不见 Users/Tokens；进 /users 直接 403 fallback
- apiv2 限流：admin 自身 superuser 不受限；普通 user 走 `default_subscription_ratelimit`（如 `5/m`）

## 9. 部署 / 迁移

1. 先后端 commit 落地（含 migration），cape-web restart
2. 240 上跑 `manage.py migrate users` 应用 drop UserProfile 表
3. 前端 build + rsync + cape-web restart（cape-web 已经在 1 中 restart 过，仅静态文件刷新）
4. e2e 跑 4/4 pass

## 10. Rollback

- 后端 migration 可写反向（重建 UserProfile 表）；但旧数据丢失（240 上仅 1 row，丢失可接受）
- 前端 commit revert 即可
- /groups SPA 删除是 git 删除文件，revert commit 恢复

风险点：UserProfile 删表后再回滚需保留 schema，最好打 tag 或保留前向 migration 不可逆的事实接受。

## 11. Open Questions / Future Work

1. **角色中间层**：未来如需"普通管理员"（管理 user 但不能删 superuser），可加 `is_admin` 字段或回引 Group 概念。当前不做。
2. **API 限流粒度**：所有非 superuser 同一全局速率，无 per-user 调整能力。如需，独立 spec。
3. **报告下载粒度**：所有非 superuser 同一全局开关，无 per-user 调整能力。同上。
4. **Audit retention**：本 spec 不动 audit；删的 group_* ACTIONs 历史行依然在表里，前端 /audit 页 filter dropdown 中 ACTIONs catalog 重新拉取后会少 3 项（已通过 `audits/actions/` endpoint 动态查询，自动同步）。

## 12. Decision Log

| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 权限模型收口 | is_superuser / is_staff / 双 flag | **is_superuser 唯一** | Django 习惯语义；自定义 IsSuperUser permission 替换 16 处 |
| /users/<id> tab 结构 | 4 tab / 单页 / 3 tab | **单页（无 tab UI）** | 删除 5 个 tab 后只剩 Basic，tab 框架冗余 |
| token Generate 入口 | 回退 /tokens / 自动签发 / Modal | **回退 /tokens 列表 + 内联 [Generate]** | 与 sub-spec #7 视觉兼容；admin 工作流单一页面 |
| UserProfile 处置 | 全局化删表 / 保留无 UI / 移进 Basic | **删除 + 全局化** | 与"剥离每用户 knob"一致；apiv2 已有全局 fallback |
| 用户级 audit 访问 | 折叠面板 / 跳全局 | **跳全局 /audit?target_user** | YAGNI；全局页已支持 |
| 范围拆分 | 1 大 spec / 拆 3 / 拆 5 | **1 大 spec** | 各层强耦合（删 group SPA 必须同删 backend；删 UserProfile 必须同改 throttling） |
| 历史 audit 行 | 删 / 保留 | **保留** | 审计无回溯需求；DB 行级清理风险 |
| `is_staff` 字段 | 删字段 / 留字段绑定 is_superuser | **留字段，自动绑定** | Django 内置字段，删除引发 deep migration；UI 不暴露即可 |
