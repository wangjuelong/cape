# Sub-spec #7 — `/tokens` 重构（Token 为主体 + 修 bug）设计

**Status:** approved-pending-spec-review
**Date:** 2026-05-06
**Branch:** refactor/web-spa
**Builds on:**
- sub-spec #3 (`/tokens` 首版，commit `9d57ea80`) — 本 spec 重写其 UI 与列表语义
- sub-spec #1 (auth-strip) — `IsAdminUser` 权限 + audit ACTIONs (`token_create/rotate/revoke`)

---

## 1. Understanding Summary

- **目标**: 把 `/tokens` 列表语义从"用户清单含 token 状态"改为"活跃 token 清单"。Token 字符串本身成为视觉主体；admin 可在该页 mask / reveal / copy 完整 key、rotate、revoke。同时修复现存 2 处样式 bug。
- **谁用**: `is_staff` 用户做 token 运维。
- **核心动机**: 用户反馈"表格显示异常"（CSS class 名错 + flex on td）+ "以 Token 为主体显示"（当前 Token 列只显示 ✅Active 占位符，未显示 key 本身）。
- **关键非目标**:
  - 不切换多 token model（DRF 1:1 保留）
  - 不加 `last_used_at` / `expires_at`
  - 不为 Reveal 操作记 audit（admin 已是受信主体；网络响应已含明文）
  - 不动 `/users/<id>/Tokens` tab UI（Generate 入口仍在那里）

## 2. Assumptions

1. DRF Token model schema 不变；仅扩展 `GET /api/v3/tokens/` 响应增加 `key` 字段。
2. `IsAdminUser` 是当前 endpoint 权限的"够用"边界；admin 已能通过 `users/<id>/token/` GET 拿到任意 user 的完整 token，所以列表响应统一附 `key` 不构成额外信息暴露面。
3. user 总数 / 有 token 用户数 < 500，cursor + limit=50 足够。
4. 现有 `TokenRevealDialog`（用于 rotate 后的"一次性"明文展示）保留；本 spec 只改列表行的 inline reveal。
5. e2e 测试重写：sub-spec #3 的 4 个测试中，"filter has_token=no" 与 "Generate→Modal→Revoke 闭环" 因语义/入口变更需删/改。

## 3. 架构

```
SPA
  routes/tokens.tsx                    Modify (~30 行删 / 新增, 简化主体逻辑)
  components/tokens/TokenListTable.tsx Rewrite (布局 + reveal/copy 逻辑)
  components/tokens/TokenFilterBar.tsx Modify (移除 has_token select)
  components/tokens/TokenRevealDialog.tsx 不变 (rotate 后的一次性弹窗保留)
  lib/api/tokens.ts                    Modify (AdminTokenRow 加 key 字段)

apiv3
  views.py:tokens_list                 Modify (始终过滤 has_token, 响应增加 key 字段)
  serializers.py:TokenAdminListItemSerializer Modify (新增 key 字段, 仅 admin 可见)

Audit                                  无改动 (复用 token_rotate / token_revoke)
DB                                     无 migration
```

## 4. 后端

### 4.1 `GET /api/v3/tokens/` 改动

**Query params 简化:**

| 参数 | 之前 | 之后 |
|---|---|---|
| `search` | username/email icontains | **保留** |
| `has_token` | `all/yes/no` | **删除**（始终 = yes）|
| `cursor` | int | **保留** |
| `limit` | int (default 50) | **保留** |

**ORM:**

```python
qs = User.objects.select_related("auth_token").filter(
    auth_token__isnull=False
).order_by("id")
# search filter unchanged
# has_token filter removed entirely
```

**响应行新增 `key` 字段:**

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
      "token_created": "2026-04-21T11:32:08Z",
      "key": "abcdef0123456789abcdef0123456789abcdef01"
    }
  ],
  "next_cursor": 14,
  "total": 27
}
```

`has_token` 字段保留（数据形状向后兼容；未来若再加 toggle 不需返工），但事实上始终为 true。

### 4.2 序列化器

`TokenAdminListItemSerializer` 增加：

```python
key = serializers.SerializerMethodField()

def get_key(self, user):
    tok = self._token(user)
    return tok.key if tok else None
```

`_token()` 已用 `try/except`（sub-spec #3 implementation）。

### 4.3 权限

不变：`@permission_classes([IsAdminUser])`。

### 4.4 安全说明

- Admin 已可通过 `GET /api/v3/users/<id>/token/` 单独获得任意 user 完整 token，所以列表附 `key` 不打破现有信任边界。
- HTTPS 传输（生产环境）；仅 admin 可见；浏览器 React 只在 reveal 时渲染明文 DOM；其他时候 mask 字符串渲染。
- 不写 `key` 到 React Query persistent storage（默认 in-memory，刷新页面重新拉取）。

## 5. 前端

### 5.1 文件清单

```
frontend/app/src/
  lib/api/tokens.ts                    Modify (AdminTokenRow 加 key: string | null)
  components/tokens/TokenListTable.tsx Rewrite (~150 行: 新布局 + 行内 reveal state)
  components/tokens/TokenFilterBar.tsx Modify (移除 has_token select 与相关 props)
  routes/tokens.tsx                    Modify (移除 onGenerate, 简化逻辑)
  tests/e2e/tokens-management.spec.mjs Rewrite 部分 (4 → 4 测试调整)
```

### 5.2 TokenListTable 新布局

```
+----------------------------------+----------------+--------------+--------------------+
| Token                            | Owner          | Created      | Actions            |
+==================================+================+==============+====================+
| abcdef…ef01  [👁]                | alice          | 2026-04-21   | [Rotate] [Revoke]  |
|                                  | alice@corp.io  |              |                    |
+----------------------------------+----------------+--------------+--------------------+
| 0f2a91…7c3d  [👁] [📋]            | bob            | 2026-04-23   | [Rotate] [Revoke]  |
|              abcdef0123…ef01     | bob@corp.io    |              |                    |
+----------------------------------+----------------+--------------+--------------------+
```

第二行 bob 是 reveal 后的状态：mono 字体、完整 40 字符明文、Copy 按钮（📋）显现；点击 👁 切换回掩码。

**Reveal 状态**: `useState<Set<number>>(revealedUserIds)` 在 `TokenListTable` 内部管理；row 自身 `revealed = revealedUserIds.has(row.user_id)`。Reveal 默认 false；切换不持久化。

**掩码函数**:

```typescript
function maskToken(key: string): string {
  if (key.length <= 10) return key; // pathological short key
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
```

**Copy 按钮**: 仅 reveal 状态下显示。点击 → `await navigator.clipboard.writeText(key)` → toast "Token copied to clipboard."。失败（剪贴板权限拒绝）→ toast error。

**Owner 列双行布局**:

```tsx
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
```

### 5.3 修 bug

| Bug | 位置 | 修复 |
|---|---|---|
| `className="table"` 不存在 | `TokenListTable.tsx:22` | 改为 `className="data"` (与 AuditTable 一致) |
| flex 直接挂 `<td>` | `TokenListTable.tsx:51` | `<td><div style={{display:"flex",gap:6}}>...</div></td>` |

### 5.4 TokenFilterBar 简化

移除 has_token select 与相关 props；保留 search 输入 + Apply / Clear。

```tsx
interface Props {
  initialSearch: string;
  onApply: (filters: { search: string }) => void;
}
```

### 5.5 routes/tokens.tsx 简化

- 移除 `hasTokenParam` state、URL 同步、`has_token` filter 传参
- 移除 `onGenerate` 回调与对应 confirm 流（保留 `onRotate` / `onRevoke`）
- `useAdminTokensInfinite` 调用形参变为 `{ search, limit: 50 }`
- 保留 `TokenRevealDialog`（rotate 成功后的一次性明文展示，与 inline reveal 互不冲突 —— rotate 必弹 dialog 提示新 key）

### 5.6 类型变化

```typescript
export interface AdminTokenRow {
  user_id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  has_token: boolean;        // 始终 true（后端语义变化后）
  token_created: string | null;
  key: string | null;        // 新增 — 完整 token 字符串
}

export interface AdminTokensListFilters {
  search?: string;
  // has_token field removed
  cursor?: number;
  limit?: number;
}
```

`key` 后端始终非 null（因为 has_token=false 已被服务端过滤掉），但 TypeScript 类型保守标 nullable，前端 `row.key ?? ""` 安全访问。

## 6. 权限

不变：endpoint `IsAdminUser`；前端 staffOnly gate 复用。

## 7. Audit

不变：复用 `token_rotate` / `token_revoke`。`token_create` ACTION 不再从 /tokens 触发（Generate 入口已移走），但仍在 `/users/<id>/Tokens` tab 触发。

## 8. 测试策略

### 8.1 后端 pytest

`tests/web/test_apiv3_tokens_list.py` 改造（不新建）：

- `test_tokens_list_returns_envelope_and_token_status` — 增加断言 `row["key"]` 存在且为 40 字符（仅 has_token rows）
- `test_tokens_list_filter_has_token_yes` — 删除（has_token query 已废）
- `test_tokens_list_filter_has_token_no` — 删除
- `test_tokens_list_only_returns_users_with_tokens` — 新增（替代上面 2 个）：3 user (1 with token, 2 without) → 响应仅 1 行
- `test_tokens_list_search_matches_username_and_email` — 保留 + 调整数据 fixture 让被 search 的 user 有 token
- `test_tokens_list_cursor_pagination` — 保留 + 给所有 fixture user 创建 token
- `test_tokens_list_forbids_non_staff` / `test_tokens_list_forbids_anonymous` — 保留

### 8.2 前端 e2e

`frontend/app/tests/e2e/tokens-management.spec.mjs`：

- 测试 1 "Sidebar shows Tokens link" — 保留
- 测试 2 "list page renders heading and table" — 保留 + 调整 selector（admin 自身有 token，所以会出现）
- 测试 3 "filter has_token=no syncs URL" — **删除**（filter 已移除）
- 测试 3 (新) "row reveals full token then masks again" — 新增：登录 → /tokens → 找 admin 行 → 默认显示掩码 `abcdef…ef01` → 点击 👁 → 显示完整 40 字符 hex → 点击 📋 → toast → 再点 👁 → 回到掩码
- 测试 4 "rotate → reveal modal → revoke" — 保留 + 调整：不再有 Generate 步骤；用 admin 自身或 sub-spec #3 临时 user 直接 rotate → modal → revoke

### 8.3 数据/兼容回归

- 部署后 admin 进 /tokens 验证：表格样式正确（不再显示异常）+ 掩码正确 + reveal/copy 功能正常 + rotate 后 modal 与 inline reveal 都工作。
- /users/<id>/Tokens tab：未改动，回归通过即可（已有 e2e 在 users-management.spec.mjs 覆盖）。

## 9. 部署 / 迁移

- 无 DB migration
- 无 conf 变更
- 部署流程：pytest 通过 → npm build → rsync → restart cape-web

## 10. Rollback

新增 `key` 字段是向后兼容（旧前端忽略未识别字段）。前端 commit revert 即下线新 UI；后端 commit revert 即停止返回 `key`（旧前端不读，新前端字段缺失会显示空 mask）。两端 revert 顺序：先前端再后端。

## 11. Open Questions / Future Work

1. **Token age 过滤**：admin 想找"超过 N 天未轮换"的 token，需 `?older_than=` 过滤 — 独立 spec。
2. **Bulk rotate 30+ stale tokens**：当前无 bulk 操作；规模化运维时再加。
3. **Audit token_view**：如果未来引入"非 admin 但有 token-read 权限"的角色，则需为 reveal 加 audit。当前 IsAdminUser 边界下不需要。
4. **Token expiry / last_used**：sub-spec #3 已记为未来工作。

## 12. Decision Log

| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 复制行为 | 复制掩码 / 复制完整 / Reveal+Copy | Reveal+Copy | 防误操作；admin 显式动作 |
| 掩码格式 | 4+4 / 6+4 / 8+4 / 圆点固定 | 首 6 + 末 4 + `…` | GitHub/Stripe 业界风格 |
| 列表语义 | 全 user / 仅有 token / toggle | 仅有 token | 与"Token 为主体"对齐；YAGNI |
| 行布局 | 单行表 / 卡片 / 6 列宽表 | 单行表 + Owner 双行 | 信息密度高；视觉主体明确 |
| Audit Reveal | 加 / 不加 | 不加 | admin 受信；audit theatre |
| Generate 入口 | 仍在 /tokens / 移走 | 移走 | /users/<id>/Tokens 已是入口；语义聚焦 |
| 后端响应 key | always / on demand / never | always (admin 列表) | 简化 + admin 已可单查 token |
| filter UI | 保留 has_token select / 删除 | 删除 | 始终 has_token=yes，UI 无意义 |
