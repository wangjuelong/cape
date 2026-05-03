# Sub-spec #3 — `/tokens` SPA admin top-level page 设计

**Status:** approved-pending-spec-review
**Date:** 2026-05-03
**Branch:** refactor/web-spa
**Builds on:**
- sub-spec #1 (auth-strip) — DRF `authtoken` 已配置；`/admin/authtoken/token/` 已 unregister
- sub-spec #1 user-mgmt apiv3 — 已有 `me/token/`、`users/<id>/token/` 三种方法 (GET/POST/DELETE) 和 audit ACTIONs `token_create / token_rotate / token_revoke`
- sub-spec #2 (groups) — 复用 cursor 分页、search filter、PageHead、useToast、radix Dialog 等模式

---

## 1. Understanding Summary

- **目标**: 新增顶级 SPA 路由 `/tokens`，admin 视角集中查看与管理所有用户的 API token。
- **谁用**: `is_staff` 用户做 token 运维（"哪些 user 该有 token 但没有？"、"批量发现陈旧 token？"、"快速 rotate/revoke 某个 user 的 key"）。
- **配合 sub-spec #1**: token 写操作仍走现有 `users/<id>/token/`（不重复造接口）；audit ACTIONs 复用，不新增。
- **关键非目标**:
  - **不切换** 多 token model（knox 等）—— DRF `authtoken` 1:1 模型保留
  - **不加** `last_used_at` 字段（避免每次鉴权写 DB；性能影响需独立评估）
  - **无** bulk 操作（bulk-rotate 风险高、bulk-revoke 容易误操作）

## 2. Assumptions

1. DRF `authtoken_token` 表 schema 不变（id, key, user_id OneToOne, created）。
2. user 总数 < 500 / 1000；cursor `id__gt` + limit=50 + Load more 足够。超大用户量（>10k）属未来工作。
3. Sidebar Admin 分组顺序：`Audit · Users · Groups · Tokens (新) · API Docs`，在 Groups 与 API Docs 之间插入。
4. 行内 token 操作复用现有 `POST/DELETE /api/v3/users/<id>/token/`，前端不引入新写 endpoint。
5. Modal 复用 radix-ui Dialog（已用于 BulkDeleteBar 等），无新依赖。
6. 旋转/生成成功后明文 token 仅在当次 Modal 显示一次；关闭即丢失（页面 state-only，不缓存到 React Query）。
7. 复用 `IsAdminUser` 权限类（与 /users、/groups 一致）。

## 3. 架构

```
SPA (1 个新路由)
  /tokens         TokensListPage   search + has-token filter + cursor 分页
                                    行内 Generate / Rotate / Revoke
                                    Generate / Rotate 成功 → Modal 显示明文

apiv3 (1 个新 endpoint)
  GET   /api/v3/tokens/              聚合 user + token 列表 (IsAdminUser)

apiv3 (复用，不改)
  POST   /api/v3/users/<id>/token/   create-or-rotate (audit: token_create | token_rotate)
  DELETE /api/v3/users/<id>/token/   revoke         (audit: token_revoke)

Sidebar Admin
  Audit → Users → Groups → Tokens (新) → API Docs

Audit
  无新 ACTION（复用 token_create / token_rotate / token_revoke）
```

## 4. 后端 apiv3 详表

### 4.1 `GET /api/v3/tokens/` — 聚合列表（新增）

**Query params:**

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `search` | str | "" | 模糊匹配 username 或 email（icontains，OR） |
| `has_token` | str | "all" | `all` / `yes` / `no` —— 过滤是否已签发 token |
| `cursor` | int | None | `id__gt` 游标（user.id） |
| `limit` | int | 50 | 上限 100 |

**返回 envelope:**

```json
{
  "data": [
    {
      "user_id": 12,
      "username": "alice",
      "email": "alice@example.com",
      "is_staff": false,
      "is_active": true,
      "has_token": true,
      "token_created": "2026-04-21T11:32:08Z"
    },
    {
      "user_id": 13,
      "username": "bob",
      "email": "",
      "is_staff": true,
      "is_active": true,
      "has_token": false,
      "token_created": null
    }
  ],
  "next_cursor": 14,
  "total": 87
}
```

`token_created` 仅当 `has_token=true` 时非 null。

**ORM:**

```python
qs = User.objects.all().order_by("id")
if search:
    qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search))
if has_token == "yes":
    qs = qs.filter(auth_token__isnull=False)
elif has_token == "no":
    qs = qs.filter(auth_token__isnull=True)
if cursor:
    qs = qs.filter(id__gt=cursor)
qs = qs.select_related("auth_token")[: limit + 1]
```

`auth_token` 是 DRF Token 模型 OneToOne 反向关系名（默认）。`select_related` 避免 N+1。

`total` 用 `.count()` 同条件查询（不含 cursor）。

### 4.2 写操作（不变，复用）

`POST /api/v3/users/<int:user_id>/token/` —— rotate 或 create
`DELETE /api/v3/users/<int:user_id>/token/` —— revoke

`_handle_token` 已在 `web/apiv3/views.py:258` 实现，含 audit。

### 4.3 序列化器

新增 `TokenAdminListItemSerializer`：

```python
class TokenAdminListItemSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(source="id")
    username = serializers.CharField()
    email = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_active = serializers.BooleanField()
    has_token = serializers.SerializerMethodField()
    token_created = serializers.SerializerMethodField()

    def get_has_token(self, user) -> bool:
        return getattr(user, "auth_token", None) is not None

    def get_token_created(self, user):
        tok = getattr(user, "auth_token", None)
        return tok.created if tok else None
```

`getattr(user, "auth_token", None)` 兼容 select_related 命中 / 未命中两种路径。

### 4.4 权限

```python
@api_view(["GET"])
@permission_classes([IsAdminUser])
def tokens_list(request: Request) -> Response: ...
```

## 5. 前端

### 5.1 路由

`frontend/app/src/router.tsx` 新增：

```tsx
{ path: "tokens", element: withSuspense(<TokensRoute />) }
```

放在 `groups/:id` 之后、`/audit` 路由之前（保持 Admin section 内顺序）。

### 5.2 文件清单

```
frontend/app/src/
  lib/api/tokens.ts               扩展 (已存在 me/user 个人 token client)
  lib/query-keys.ts               扩展 (新增 tokens.adminList(filters))
  hooks/useTokensAdmin.ts         新建 (useAdminTokensInfinite + useRotateUserToken + useRevokeUserToken)
  components/tokens/
    TokenFilterBar.tsx            新建 (~60 lines)
    TokenListTable.tsx            新建 (~110 lines)
    TokenRevealDialog.tsx         新建 (~70 lines, radix Dialog)
  routes/tokens.tsx               新建 (~200 lines)
  components/shell/Sidebar.tsx    Modify (新增 Tokens entry)
  components/shell/icons.tsx      Modify (新增 keyRound icon)
```

### 5.3 类型定义（`lib/api/tokens.ts` 追加）

```typescript
export interface AdminTokenRow {
  user_id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  has_token: boolean;
  token_created: string | null;
}

export interface AdminTokensListResponse {
  data: AdminTokenRow[];
  next_cursor: number | null;
  total: number;
}

export interface AdminTokensListFilters {
  search?: string;
  has_token?: "all" | "yes" | "no";
  cursor?: number;
  limit?: number;
}

export async function listAdminTokens(
  filters: AdminTokensListFilters = {},
): Promise<AdminTokensListResponse> {
  // GET /api/v3/tokens/?search=&has_token=&cursor=&limit=
}
```

`rotateUserToken(userId)` 和 `revokeUserToken(userId)` 已存在，直接复用。

### 5.4 query-keys 扩展

```typescript
export const queryKeys = {
  // ...
  tokens: {
    me: ["tokens", "me"] as const,
    user: (userId: number) => ["tokens", "user", userId] as const,
    adminList: (filters: AdminTokensListFilters) =>
      ["tokens", "adminList", filters] as const,
  },
};
```

### 5.5 useTokensAdmin hook

```typescript
export function useAdminTokensInfinite(filters: Omit<AdminTokensListFilters, "cursor">) {
  return useInfiniteQuery({
    queryKey: queryKeys.tokens.adminList(filters),
    queryFn: ({ pageParam }) =>
      listAdminTokens({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
```

`useRotateUserToken` / `useRevokeUserToken` 已在 sub-spec #1 实现，复用并在 onSuccess 处 invalidate `queryKeys.tokens.adminList`。

### 5.6 TokensListPage UI 结构

```
┌──────────────────────────────────────────────────────────┐
│ Tokens                              total: 87 ▾          │
│ Manage API tokens for all users.                         │
├──────────────────────────────────────────────────────────┤
│ [search…] [has-token: all ▾]  [Apply] [Clear]            │
├────┬──────────┬───────────────┬───────┬───────────┬───────────────────────┤
│ #  │ Username │ Email         │ Staff │ Token     │ Actions               │
├────┼──────────┼───────────────┼───────┼───────────┼───────────────────────┤
│ 12 │ alice    │ alice@…       │       │ ✅ Active │ [Rotate] [Revoke]     │
│ 13 │ bob      │ —             │ ✓     │ ⊘         │ [Generate]            │
│ 14 │ carol    │ carol@…       │       │ ✅ Active │ [Rotate] [Revoke]     │
└────┴──────────┴───────────────┴───────┴───────────┴───────────────────────┘
                          [Load more]
```

- `username` 是链接，→ `/users/<id>` 详情。
- `Token` 列：`✅ Active` 时 hover 显示 created 日期；`⊘` 时无日期。
- Action 按钮：
  - 无 token → `[Generate]`：confirm dialog "Generate API token for `<username>`?" → 调 rotateUserToken → 成功 → 弹 `TokenRevealDialog` 显示明文 + Copy。
  - 有 token → `[Rotate]`：confirm "Rotate token for `<username>`? Existing key will stop working immediately." → 弹 `TokenRevealDialog` 显示新明文。
  - 有 token → `[Revoke]`：confirm "Revoke `<username>`'s token? This cannot be undone." → 调 revokeUserToken → invalidate list。

### 5.7 TokenRevealDialog（radix Dialog）

```tsx
interface Props {
  username: string;
  tokenKey: string;
  onClose: () => void;
}
```

内容：
- Title: "Token generated for {username}"
- Description: "This is the only time the full key will be shown. Copy it now."
- Code block 显示完整 `tokenKey`（默认 reveal）
- `[Copy]` `[Close]` 按钮
- Close → onClose() → 父组件 setKey(null) 丢弃明文

### 5.8 Sidebar 入口

```tsx
{ to: "/tokens", label: "Tokens", icon: Icon.keyRound, staffOnly: true }
```

放在 Groups 与 API Docs 之间。`Icon.keyRound` 用 lucide-react 的 `KeyRound`。

### 5.9 URL state

filter 与 cursor 同步到 query string（与 /users、/groups 模式一致）：

- `?search=alice` `?has_token=yes` 等

## 6. 权限

| 操作 | 谁可以 |
|---|---|
| `GET /api/v3/tokens/` | `IsAdminUser` |
| `POST /api/v3/users/<id>/token/` | `IsAuthenticated` —— 自己可对自己 ✓；admin 对他人 ✓；非 admin 对他人 → 403（已在 `users_token` view 校验） |
| `DELETE /api/v3/users/<id>/token/` | 同上 |
| 路由 `/tokens` | sidebar 仅在 `is_staff=true` 时显示；页面级守卫复用 useCurrentUser staffOnly gate |

## 7. Audit

**复用现有 ACTIONs**（来自 sub-spec #1，`web/audit_log/__init__.py`）：

| Action | 触发点 | target |
|---|---|---|
| `token_create` | 首次为某 user 签发 token | user_id |
| `token_rotate` | 替换已有 token | user_id |
| `token_revoke` | 删除 token | user_id |

`_handle_token` 已实现 audit 调用，无需改动。

## 8. 测试策略

### 8.1 后端 pytest

新建 `tests/test_apiv3_tokens.py`，至少 6 测试：

1. `test_tokens_list_returns_all_users_with_token_status` —— 创建 3 user (1 staff w/ token, 1 user w/ token, 1 user wo/ token)，admin 调 → data 长度 3，有/无 token 字段正确。
2. `test_tokens_list_filter_has_token_yes` —— `?has_token=yes` 仅返回有 token 的 2 个。
3. `test_tokens_list_filter_has_token_no` —— `?has_token=no` 仅返回无 token 的 1 个。
4. `test_tokens_list_filter_search` —— `?search=alice` 仅返回 username/email 匹配的。
5. `test_tokens_list_cursor_pagination` —— 创建 3 user, limit=2，第一页 next_cursor=user2.id，第二页用该 cursor 拿到 user3。
6. `test_tokens_list_forbids_non_admin` —— 非 staff 调 → 403。

### 8.2 前端 e2e

新建 `frontend/app/tests/e2e/tokens-management.spec.mjs`，覆盖：

1. **Sidebar 链接** —— admin 登录后 sidebar 出现 "Tokens" 链接，点击进入 `/tokens`。
2. **List 渲染** —— 表格出现，至少有 admin 自身一行。
3. **Filter `has-token=no`** —— Apply → URL 同步 `?has_token=no`，admin 自身（已有 token）不在结果中。
4. **Generate → Reveal Modal → Revoke 闭环** —— 新建临时 user `e2e-tok-tmp`（通过 `/users/new`）→ 进 /tokens 找到该行 → Generate → confirm → Modal 显示 40 字符 key + Copy 按钮 → Close → 行变 ✅Active → Revoke → confirm → 行变 ⊘。最后清理：删除 `e2e-tok-tmp`（同 e2e）。

环境变量沿用 `PARITY_SPA_URL` / `SPA_LOGIN_USER` / `SPA_LOGIN_PASS`（与 groups-management.spec.mjs 一致）。

## 9. 部署 / 迁移

- **无 DB migration**（schema 不变）。
- **无 conf 变更**。
- 部署只需：`npm run build` → rsync → `systemctl restart cape-web`。

## 10. Rollback

单一新 commit 链；revert J1（最后一个 commit）即下线 `/tokens`。后端 endpoint 也是新增独立 view，无副作用，revert 即彻底移除。

## 11. Open Questions / Future Work

1. **Last-used 列**：独立 spec，需评估每次 TokenAuthentication 写 DB 的开销；可考虑批量异步写入 + 5 分钟缓冲。
2. **多 token 模型**：knox / drf-multi-token-auth 替换 DRF authtoken；scope 大（每个 user 多 named token，CI key 可独立 revoke）。
3. **Token expiry**：当前 token 永不过期；可加 `expires_at` 字段 + cron 自动 revoke。
4. **超大用户量分页**：>10k user 时 `id__gt` + icontains search 可能慢，需加 `username` GIN 索引或切到 server-side 分页加排序选项。

## 12. Decision Log

| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 列表粒度 | 每 user / 仅 has-token / 多 token model | 每 user 一行 | 与 OneToOne model 一致；admin 能看到"该有但没有"的 user |
| Last-used 列 | 加 / 不加 | 不加 | 每次鉴权写 DB 性能影响需独立评估 |
| 批量操作 | bulk-revoke / 无 | 无 | 误操作风险 > 收益；单行操作已够用 |
| Endpoint 形态 | 新聚合 / 扩展 users / 完整 tokens 资源 | 新聚合 GET | 写操作复用 `users/<id>/token/`，最小改动 |
| Reveal 方式 | Modal / 内联展开 / 跳详情 | Modal | 列表上下文不需持久 reveal；与 confirm 模式一致 |
| Audit ACTIONs | 新建 / 复用 | 复用现有 3 个 | 写路径就是现有 `_handle_token`；无新事件类型 |
| 分页 | cursor / 无 | cursor `id__gt` | 与 /users、/groups 一致 |
| 路由位置 | `/tokens` 顶级 / `/admin/tokens` 嵌套 | `/tokens` 顶级 | 与 /users、/groups 平级；sub-spec #1 已建立此模式 |
