# 用户管理功能 设计 (User Management)

**Status:** approved-pending-spec-review
**Date:** 2026-05-02
**Branch:** refactor/web-spa
**Architecture choice:** 双链路 — Admin user CRUD 复用 Django `/admin/auth/user/`；Self-service 走 SPA 内 modal + 2 个新 apiv3 endpoint。

---

## 1. 目标 (Goal)

让普通用户在 SPA 内完成两件事，不必离开 SPA：
1. 修改自己的 profile（first_name / last_name / email）
2. 修改自己的密码

让 is_staff 用户从 SPA 侧栏一键跳到 Django admin 的用户 CRUD 页（不在 SPA 重复实现 admin 功能）。

零功能裁剪：admin 用户管理的全套能力（创建用户、改 is_staff、改密、删除、groups / permissions 多对多关联）继续走 `/admin/auth/user/`，无 SPA-side 重新实现。

---

## 2. 关键约束 (Constraints)

- **不实现 admin user CRUD 在 SPA 内** — Django admin 已经齐备，重新实现是浪费且有合规风险（密码流转）
- **Self-service 永远不暴露权限提升字段** — `PATCH /api/v3/me/` 拒绝接收 username / is_staff / is_superuser / is_active / last_login / date_joined
- **Email 改动直接生效** — 不走 allauth 的 EmailAddress 验证流（用户已登录，admin 信任）
- **session 在改密后不强制失效** — Django 默认行为；用户保留当前会话
- **审计不存旧值** — 避免 PII（旧 email、旧名）落库；只记录 changed field names

---

## 3. 架构 (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│ Admin user CRUD                                              │
│   SPA 侧栏 Admin 区 "Users" 链接                             │
│        ↓ same-tab navigate                                   │
│   Django /admin/auth/user/  (现有 CustomUserAdmin)           │
│   - 创建用户 / 改 is_staff / 改密 / 删除                     │
│   - groups / permissions m2m                                 │
│   - bulk activate / deactivate                               │
│   - audit_log 已通过 LogEntry post_save bridge 自动捕获      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Self-service                                                 │
│   SPA 头像下拉                                                │
│   ├─ Edit profile      → ProfileEditModal                    │
│   │     PATCH /api/v3/me/ {first_name?, last_name?, email?}  │
│   │     → invalidate useCurrentUser → topbar 刷新             │
│   │     → modal 关 + success toast                            │
│   │     → audit_log: profile_update + fields=[...]           │
│   ├─ Change password   → PasswordChangeModal                  │
│   │     POST /api/v3/me/password/                             │
│   │       {current_password, new_password, confirm_password} │
│   │     → user.set_password() 触发 password_changed signal   │
│   │     → audit_log 复用现有 password_change action          │
│   │     → 204 No Content + modal 关 + success toast          │
│   ├─ ────────                                                 │
│   └─ Sign out           (现有)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 后端 apiv3 endpoint

### 4.1 `PATCH /api/v3/me/`

**Request body**（任何字段都可选）：
```json
{ "first_name": "string", "last_name": "string", "email": "string" }
```

**Validation (`MeUpdateSerializer`)**：
- `first_name`: max 150 chars, 允许空字符串清空
- `last_name`: max 150 chars
- `email`: RFC 5322 + EmailValidator
- 拒绝 `username` / `is_staff` / `is_superuser` / `is_active` / `password` 字段（任何额外字段 400）

**Response**：200 with the same shape as `GET /api/v3/me/`（current MeSerializer 形态）—— 让 SPA 立刻替换 cache。

**Side effects**：
- 计算 changed fields = 提交字段 ∩ (实际值 != 旧值)
- 若 changed_fields 非空：`audit.log("profile_update", request=request, actor=request.user, target_user=request.user, fields=changed_fields_list)`
- 若 changed_fields 为空：仍 200，不发审计（noop）

**Permission**: `IsAuthenticated`. 任何登录用户都能改自己的 profile.

### 4.2 `POST /api/v3/me/password/`

**Request body**:
```json
{ "current_password": "string", "new_password": "string", "confirm_password": "string" }
```

**Validation (`ChangePasswordSerializer`)**:
- 三个字段必填，纯字符串
- `new_password == confirm_password`
- `request.user.check_password(current_password)` 必须 True
- Django password validators (`AUTH_PASSWORD_VALIDATORS` setting) 全部通过

**实现**：
```python
serializer = ChangePasswordSerializer(data=request.data, context={"user": request.user})
serializer.is_valid(raise_exception=True)
request.user.set_password(serializer.validated_data["new_password"])
request.user.save()
# 不需要显式 audit.log() — allauth password_changed signal 已经触发，
# audit_log/signals.py:_on_password_changed 自动记录 password_change action.
return Response(status=204)
```

**Response**: 204 No Content（成功），400 with `{error, error_value, fields:{...}}` envelope（失败）。

**Permission**: `IsAuthenticated`.

**Session 行为**：默认不失效（Django session 在 `set_password` 后仍有效）。如果将来要改成强制重新登录，可以在 200 之后调 `update_session_auth_hash(request, user)` —— 不在本次范围。

---

## 5. 前端

### 5.1 侧栏 Admin 区入口

文件：`frontend/app/src/components/shell/Sidebar.tsx`

扩展 `NavItem` 类型加 `external?: boolean` 标志：
```ts
interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<...>;
  external?: boolean;  // 新加
}
```

渲染逻辑：external=true 时用 `<a href={to}>` 而不是 `<Link to={to}>`，同标签页跳转。

新加的项放在 Admin 区（与 Audit / API Docs 同组），仅 `useCurrentUser().is_staff` 可见：
```tsx
{ to: "/admin/auth/user/", label: "Users", icon: Icon.users, external: true }
```

`Icon.users` 已在 `components/shell/icons.tsx` 中（与 sidebar 现有图标风格一致）；若不存在则按现有图标命名规则新增。

### 5.2 头像下拉菜单

文件：`frontend/app/src/components/shell/Topbar.tsx`（已确认 — line 23 的 `useLogout()` + line 83 的 `aria-label="Account menu for ${username}"` + line 132 的 `signOut()` 都在这个文件）。

新加 2 个 `<MenuItem>`，**置于 Sign out 上方**：
```tsx
<MenuItem onClick={() => setEditOpen(true)}>Edit profile</MenuItem>
<MenuItem onClick={() => setPwdOpen(true)}>Change password</MenuItem>
<Divider />
<MenuItem onClick={signOut} className="danger">Sign out</MenuItem>
```

两个 modal 状态在 topbar 组件里持有；ESC / 点 backdrop 关闭。

### 5.3 ProfileEditModal

新文件：`frontend/app/src/components/account/ProfileEditModal.tsx`

```
┌────────── Edit profile ──────────────────────┐
│                                              │
│ First name      [admin           ]           │
│ Last name       [                ]           │
│ Email           [admin@example.com]          │
│                                              │
│   <error inline if 400>                      │
│                                              │
│             [Cancel]  [Save]                 │
└──────────────────────────────────────────────┘
```

- pre-fill from `useCurrentUser().data`
- Save: 调用 `updateMe({first_name, last_name, email})`
- 成功 → `queryClient.invalidateQueries(queryKeys.me)` → modal 关 → 触发 toast `"Profile updated."`
- 失败 → inline error 文本（`error_value` 或字段级 `fields.email = "..."` ）

### 5.4 PasswordChangeModal

新文件：`frontend/app/src/components/account/PasswordChangeModal.tsx`

```
┌────────── Change password ───────────────────┐
│                                              │
│ Current password    [          ]             │
│ New password        [          ]  (≥8 chars) │
│ Confirm new         [          ]             │
│                                              │
│   <error inline>                             │
│                                              │
│             [Cancel]  [Update password]      │
└──────────────────────────────────────────────┘
```

- 客户端预校验：new === confirm；new ≥ 8（与服务端 minimum 一致避免来回）
- Submit: `changePassword({current_password, new_password, confirm_password})`
- 成功 → modal 关 → toast `"Password changed."`，session 不失效
- 失败 → 字段级 inline error：`Current password is incorrect.` / `Password too weak.` / `Passwords do not match.`

### 5.5 API client

新文件：`frontend/app/src/lib/api/me.ts`

```ts
import { apiClient } from "./client";
import type { MeResponse } from "@/types/api";

export interface UpdateMePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
}

export async function updateMe(payload: UpdateMePayload): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>("/me/", payload);
  return data;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post("/me/password/", payload);
}
```

### 5.6 Toast 实现

调研结果：SPA 当前**没有** toast 系统（grep `frontend/app/src` 无 `<Toast>` / `useToast` 命中）。决定加一个**最小实现**：

- 新文件：`frontend/app/src/components/shared/Toast.tsx`
- API：`useToast()` hook 暴露 `showToast(message, variant?)` ∈ `{success | error}`
- 容器在 `<Shell>` 顶层挂载，绝对定位于右下角，3 秒淡出
- 多条 toast 堆叠（数组 state）；点击 toast 立刻 dismiss
- 不引外部依赖（不用 react-hot-toast / sonner，避免新 dep）
- 估计 80 lines

**Why not in-page banner**：banner 在 modal 关闭后就看不到了；toast 独立于 modal 生命周期。
**Why minimum custom**：避免引第三方依赖；现有 toast 用例只有 2 个（profile updated / password changed），不值得拉框架。

---

## 6. 审计 (Audit)

| Action | 来源 | 状态 |
|---|---|---|
| `password_change` | allauth `password_changed` signal | ✅ **已存在** — `web/audit_log/signals.py:_on_password_changed` |
| `profile_update` | 新 — PATCH /me/ 内显式 `audit.log()` | ❌ **新加 ACTION + 调用** |
| admin 改 user (addition / change / deletion) | LogEntry post_save bridge | ✅ **已存在** |

新加 ACTION 到 `web/audit_log/__init__.py`：
```python
ACTIONS: tuple[tuple[str, str, str], ...] = (
    # ... existing ...
    ("profile_update", "Profile Update", "auth"),
)
```

`metadata`:
```json
{ "fields": ["email", "first_name"] }
```
**只存 changed field names，不存旧值或新值**（PII 防泄漏）。

---

## 7. 验证 (Verification)

### 7.1 pytest — `tests/web/test_apiv3_me.py`

| Case | Expected |
|---|---|
| GET /me/ 返回当前 user | 200 with username/email/is_staff/... |
| PATCH /me/ {email: "x@y.z"} | 200; user.email == "x@y.z" |
| PATCH /me/ {} | 200; 无 audit log 写入 |
| PATCH /me/ {username: "x"} | 400; user.username 不变 |
| PATCH /me/ {is_staff: true} | 400 |
| PATCH /me/ {email: "not-an-email"} | 400 with fields.email |
| POST /me/password/ {current=正确, new=AAA, confirm=AAA} | 400（密码太弱） |
| POST /me/password/ {current=错, new=...} | 400; user.password 不变 |
| POST /me/password/ {current=正确, new=Strong1!, confirm=mismatch} | 400 |
| POST /me/password/ {current=正确, new=Strong1!, confirm=Strong1!} | 204; user.check_password("Strong1!") == True |
| audit_log 包含 profile_update 行 | True |
| audit_log 包含 password_change 行 | True |

### 7.2 Playwright — `frontend/app/tests/e2e/account-self-service.spec.mjs`

| Step | Expected |
|---|---|
| Login as admin | shell renders |
| 点头像 dropdown | 看见 "Edit profile" + "Change password" + "Sign out" 3 项 |
| 点 Edit profile → 改 first_name → Save | modal 关 + toast；topbar 头像首字母更新 |
| 点 Change password → 输 current=cape123! / new=NewPass123! / confirm=NewPass123! → Update | modal 关 + toast |
| Sign out | 跳到 /accounts/login/ |
| 用 NewPass123! 登录 | 成功 |
| 还原密码（用 NewPass123! → 改回 cape123!） | 不污染下次测试环境 |

### 7.3 Manual smoke

- 点侧栏 "Users" → 浏览器跳到 `http://192.168.1.6:8000/admin/auth/user/`，Django admin 列表渲染
- 浏览器后退 → 回 SPA / dashboard
- 改 email 后 audit log 出现 `profile_update` 行，`actor=admin`，`metadata.fields=["email"]`

---

## 8. 风险 (Risks) 与回滚

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| email 改动后老 email 仍能登 / 老 EmailAddress 行残留 | 中 | 用户混淆 | 文档明确：email 改动直接生效，allauth 的 EmailAddress 不联动；单独 spec 时再做联动 |
| 改密后 session 失效 | 低 | 用户被踢 | Django 默认 session 不失效；不调 update_session_auth_hash |
| PATCH /me/ 接收 password 字段误改密码 | **不会** | 严重 | serializer 显式 deny；test case 锁住 |
| 弱密码穿透 | 低 | 安全 | Django AUTH_PASSWORD_VALIDATORS 全验 + 客户端预校验 |
| 浏览器 back 从 admin 回 SPA 状态错乱 | 低 | UX | 同标签页跳转后浏览器自身的 history 处理；SPA route state 不存在 cross-domain |

回滚单元 = 每个 commit 独立 revert。

---

## 9. 范围之外 (Out of Scope)

明确不做：

- Email 改动的二次验证流（添加新 email → 收验证邮件 → 切换 → 删旧）
- 头像图片上传（继续用 username 首字母 fallback）
- Username 改动（identifier 不可变）
- 2FA 自助启停
- API Token 自助管理（生成 / 撤销）
- 通过 SPA 修改其他用户的 profile（永远走 /admin/）
- 用户分组 / permissions 在 SPA 内编辑（永远走 /admin/）
- Strong password meter UI（客户端就一个长度提示就够）
- session timeout 自助配置

---

## 10. 文件清单 (Manifest)

| Path | 状态 | 估计行数 |
|---|---|---|
| `web/apiv3/views.py` | 修改：加 `me_update`, `me_password_change` | +90 |
| `web/apiv3/serializers.py` | 修改：加 MeUpdateSerializer + ChangePasswordSerializer | +60 |
| `web/apiv3/urls.py` | 修改：加 `path("me/", views.me_update, ...)` 改方法 + 加 `path("me/password/", ...)` | +5 |
| `web/audit_log/__init__.py` | 修改：ACTIONS 加 `("profile_update", "Profile Update", "auth")` | +1 |
| `web/audit_log/migrations/` | （audit_events 表无 schema 变化 — 不需要新 migration） | 0 |
| `frontend/app/src/lib/api/me.ts` | 新建 | ~50 |
| `frontend/app/src/components/shell/Sidebar.tsx` | 修改：NavItem 加 external + Admin 区加 Users 项 | ~15 |
| `frontend/app/src/components/shell/icons.tsx` | 修改：加 `users` 图标（如缺） | ~5 |
| `frontend/app/src/components/shell/Topbar.tsx` | 修改：加 Edit profile + Change password 菜单项 + modal state | ~25 |
| `frontend/app/src/components/shared/Toast.tsx` | 新建：minimum toast container + useToast hook | ~80 |
| `frontend/app/src/components/account/ProfileEditModal.tsx` | 新建 | ~120 |
| `frontend/app/src/components/account/PasswordChangeModal.tsx` | 新建 | ~130 |
| `tests/web/test_apiv3_me.py` | 新建 | ~120 |
| `frontend/app/tests/e2e/account-self-service.spec.mjs` | 新建 | ~80 |
| `docs/web/api-reference.md` | 修改：加 `PATCH /me/` 和 `POST /me/password/` 章节 | ~30 |

**总计**：~3 后端文件改 + 4 前端新文件 + 4 前端文件改 + 2 测试文件 + 1 文档改，**~730 lines** 净增。

---

## 11. 实现顺序建议

任务按依赖顺序：

1. **Backend 先**：apiv3 endpoint + serializer + audit ACTION + pytest 全绿
2. **API client**：`me.ts`
3. **侧栏 + 图标**：external NavItem 支持 + Users 链接
4. **Modal 组件**：先 ProfileEditModal，再 PasswordChangeModal
5. **头像下拉接线**：菜单项 + modal 状态
6. **Toast 系统**（如缺）：新加最小 toast 容器
7. **Playwright e2e**：account-self-service.spec.mjs
8. **api-reference.md 文档**

每步独立 commit，方便回滚。
