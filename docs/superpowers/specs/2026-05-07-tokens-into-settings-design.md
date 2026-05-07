# Sub-spec #9 — Tokens 迁入 `/settings` + GitHub PAT 风格简化

**Status:** approved-pending-spec-review
**Date:** 2026-05-07
**Branch:** refactor/web-spa
**Builds on / Reverses:**
- sub-spec #7 (Token-as-primary 重构) — **保留 mask + RevealDialog 视觉**；**删除 inline reveal/copy/rotate 按钮**
- sub-spec #8 strip RBAC — **保留 IsSuperUser + UserProfile 删除**；**反转 T3 的 "tokens_list 不过滤" 决策（恢复 `auth_token__isnull=False`）**

---

## 1. Understanding Summary

- **目标**：把 admin token 管理迁移到新 `/settings` 路由（无 tab UI，仅承载 Tokens 内容），重做 Token 列表为 GitHub PAT 风格——3 列 `Username | Token (mask) | Actions (Revoke)`，掩码 `XXXX****YYYY`，无 inline reveal/copy/rotate；新增 `[+ Add Token]` modal（dropdown 选无 token 用户 → 生成 → 一次性 RevealDialog 展示完整 key）。
- **关键非目标**：
  - 不动 sub-spec #8 其他改动（IsSuperUser、UserProfile 删除、`/users/<id>` 单页化）
  - 不动后端写路径（仍是现有 `POST/DELETE /api/v3/users/<id>/token/`）
  - 不动 audit ACTIONs（`token_create` / `token_revoke` 仍照旧记录）
  - 不引入 tab UI 框架（仅 1 项内容时 YAGNI）
  - 不实现 `/configs` 替代品（直接删除 stub）

## 2. Assumptions

1. Sub-spec #8 T3 反转：`tokens_list` 重新加 `.filter(auth_token__isnull=False)`，序列化 `key` 字段保留；现有 6 个 pytest 中的 `test_tokens_list_returns_all_users_token_or_not` 改回 `test_tokens_list_only_returns_users_with_tokens`。
2. `/api/v3/users/` 接受新 query param `?has_token=no`，过滤 `auth_token__isnull=True`，与现有 `?search=` / `?cursor=` filter 共存。
3. `TokenRevealDialog` 组件保留（sub-spec #7 引入，sub-spec #8 仍在使用）— Add Token modal 成功路径复用。
4. 旧 `/tokens` 路由删除后访问该 URL → SPA NotFound 页面（用户 Q3 选 a 接受）。旧 sidebar Admin > Tokens entry 移除。Workspace > Configs entry 移除。新增 Admin > Settings entry（icon `cog`）。
5. e2e `tokens-management.spec.mjs` 改名/重写为 `settings-tokens-management.spec.mjs` 并迁移测试用例至新路径与新 UI。
6. 用户量小（< 50），native `<select>` dropdown 在 Add Token modal 中体验 OK。autocomplete 留作未来扩展。

## 3. 架构

```
SPA 路由
  /tokens           删除（旧顶级）
  /configs          删除（StubPage 占位）
  /settings         新建（无 tab UI，仅 Tokens 内容）

Sidebar
  Workspace 区     删 Configs
  Admin 区         删 Tokens；新增 Settings（cog icon）

apiv3
  GET /api/v3/tokens/        反转 sub-spec #8 T3 → 重新过滤 auth_token__isnull=False
  GET /api/v3/users/?has_token=no   新增 filter（用于 Add Token modal dropdown）
  POST /api/v3/users/<id>/token/   不变（Add Token modal 调用）
  DELETE /api/v3/users/<id>/token/  不变（Revoke 按钮调用）

audit
  token_create / token_revoke    不变（_handle_token 已埋点）

DB / migration
  无
```

## 4. 后端

### 4.1 `tokens_list` 反转 sub-spec #8 T3

`web/apiv3/views.py` `tokens_list` queryset 改回：

```python
# 现状（sub-spec #8 T3 之后）
qs = User.objects.select_related("auth_token").order_by("id")

# sub-spec #9 之后
qs = (
    User.objects.select_related("auth_token")
    .filter(auth_token__isnull=False)
    .order_by("id")
)
```

`extend_schema` description 改为 "Returns only users with active API tokens." (即 sub-spec #7 时的描述，复刻)。

### 4.2 `users_list` 加 `has_token` filter

`web/apiv3/views.py` `users_list` GET 分支增加：

```python
has_token = request.query_params.get("has_token")
if has_token == "yes":
    qs = qs.filter(auth_token__isnull=False)
elif has_token == "no":
    qs = qs.filter(auth_token__isnull=True)
```

`extend_schema` 加 OpenApiParameter：

```python
OpenApiParameter(
    name="has_token", type=OpenApiTypes.STR, required=False,
    enum=["yes", "no"],
),
```

### 4.3 测试

`tests/web/test_apiv3_tokens_list.py`：
- 替换 `test_tokens_list_returns_all_users_token_or_not` 回到 `test_tokens_list_only_returns_users_with_tokens`（6 个 user fixture，仅 admin + 1 有 token；assert 响应 data 长度 = 2）
- 其他 5 个测试保持不变

`tests/web/test_apiv3_users_list.py`：
- 新增 2 个测试：
  - `test_users_list_filter_has_token_yes` — 创建 3 user，1 有 token；`?has_token=yes` 仅返回有 token 的
  - `test_users_list_filter_has_token_no` — 同上但 `?has_token=no` 返回 2 个无 token 的

### 4.4 权限

不变：`IsSuperUser` 已在 sub-spec #8 T1 替换。

## 5. 前端

### 5.1 文件清单

```
frontend/app/src/
  routes/configs.tsx                       删
  routes/tokens.tsx                        删
  routes/settings.tsx                      新建（约 ~80 行）
  components/tokens/                       目录保留，文件改造：
    TokenListTable.tsx                     重写（3 列 + 删 reveal/copy/rotate）
    TokenFilterBar.tsx                     保留（search-only）
    TokenRevealDialog.tsx                  保留（不变）
    AddTokenModal.tsx                      新建（约 ~120 行）
  lib/api/tokens.ts                        AdminTokenRow 保持有 key；mask 函数前移到 TokenListTable
  lib/api/users.ts                         listUsers filters 加 has_token: "yes" | "no" | undefined
  hooks/useTokensAdmin.ts                  保留
  components/shell/Sidebar.tsx             drop Configs + Tokens；新增 Settings
  router.tsx                               drop /configs + /tokens；注册 /settings
  components/shell/icons.tsx               keyRound 可保留（其他位置可能用到，无碍）
```

### 5.2 `routes/settings.tsx` 内容

```tsx
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/shared/Toast";
import { TokenFilterBar } from "@/components/tokens/TokenFilterBar";
import { TokenListTable } from "@/components/tokens/TokenListTable";
import { TokenRevealDialog } from "@/components/tokens/TokenRevealDialog";
import { AddTokenModal } from "@/components/tokens/AddTokenModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAdminTokensInfinite } from "@/hooks/useTokensAdmin";
import { revokeUserToken, type AdminTokenRow } from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

interface RevealState {
  username: string;
  tokenKey: string;
}

export default function SettingsRoute() {
  const me = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const search = searchParams.get("search") ?? "";
  const filters = useMemo(() => ({ search, limit: 50 }), [search]);
  const q = useAdminTokensInfinite(filters);

  const rows: AdminTokenRow[] = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );
  const total = q.data?.pages[0]?.total ?? 0;

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const revokeM = useMutation({
    mutationFn: (userId: number) => revokeUserToken(userId),
    onMutate: (userId) => setPendingUserId(userId),
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
      qc.invalidateQueries({ queryKey: queryKeys.tokens.user(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast("Token revoked.", "success");
    },
    onError: () => showToast("Revoke failed.", "error"),
    onSettled: () => setPendingUserId(null),
  });

  if (me.data && !me.data.is_superuser) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
        <Alert variant="destructive">
          <AlertTitle>Forbidden</AlertTitle>
          <AlertDescription>Settings is restricted to superusers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  function applyFilters(next: { search: string }) {
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    setSearchParams(params, { replace: true });
  }

  function onRevoke(row: AdminTokenRow) {
    if (pendingUserId !== null) return;
    if (!window.confirm(`Revoke ${row.username}'s token?\n\nThis cannot be undone.`)) return;
    revokeM.mutate(row.user_id);
  }

  function onAddSuccess(username: string, tokenKey: string) {
    setAddOpen(false);
    setReveal({ username, tokenKey });
    qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
    qc.invalidateQueries({ queryKey: queryKeys.users.all });
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Settings"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h2 className="panel-h" style={{ margin: 0 }}>
              API Tokens <span className="dim" style={{ fontSize: 11 }}>({total})</span>
            </h2>
            <button
              type="button"
              className="btn primary"
              onClick={() => setAddOpen(true)}
              style={{ display: "flex", gap: 4, alignItems: "center" }}
            >
              <Plus size={14} /> Add Token
            </button>
          </div>
          <div style={{ padding: 12, display: "grid", gap: 12 }}>
            <TokenFilterBar initialSearch={search} onApply={applyFilters} />
            {q.isLoading ? (
              <div style={{ padding: 24 }}>
                <Spinner size={14} />
              </div>
            ) : q.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load tokens</AlertTitle>
                <AlertDescription>{String(q.error)}</AlertDescription>
              </Alert>
            ) : (
              <TokenListTable
                rows={rows}
                onRevoke={onRevoke}
                pendingUserId={pendingUserId}
              />
            )}
            {q.hasNextPage && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={q.isFetchingNextPage}
                  onClick={() => q.fetchNextPage()}
                >
                  {q.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {addOpen && <AddTokenModal onClose={() => setAddOpen(false)} onSuccess={onAddSuccess} />}
      {reveal && (
        <TokenRevealDialog
          username={reveal.username}
          tokenKey={reveal.tokenKey}
          onClose={() => setReveal(null)}
        />
      )}
    </>
  );
}
```

### 5.3 TokenListTable 重写

新版 props：

```typescript
interface Props {
  rows: AdminTokenRow[];
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}
```

mask 函数：

```typescript
function maskToken(key: string): string {
  if (key.length <= 8) return key; // pathological short
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
```

行结构（无 reveal、无 copy、无 rotate）：

```tsx
<tr>
  <td>
    <Link to={`/users/${row.user_id}`}>{row.username}</Link>
  </td>
  <td>
    <code className="mono" style={{ ... }}>
      {row.key ? maskToken(row.key) : "—"}
    </code>
  </td>
  <td>
    <button
      type="button"
      className="btn danger"
      disabled={busy}
      onClick={() => onRevoke(row)}
    >
      {busy ? "…" : "Revoke"}
    </button>
  </td>
</tr>
```

无 has-token vs no-token 分支（list 仅返回 has-token rows，所以 row.key 始终非 null；防御 fallback `"—"` 处理 race / 边缘情况）。

### 5.4 AddTokenModal 新建

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { listUsers } from "@/lib/api/users";
import { rotateUserToken } from "@/lib/api/tokens";

interface Props {
  onClose: () => void;
  onSuccess: (username: string, tokenKey: string) => void;
}

export function AddTokenModal({ onClose, onSuccess }: Props) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["users", "no-token"],
    queryFn: () => listUsers({ has_token: "no", limit: 200 }),
  });

  const m = useMutation({
    mutationFn: (userId: number) => rotateUserToken(userId),
    onSuccess: (data, userId) => {
      const user = usersQ.data?.data.find((u) => u.id === userId);
      if (data.key && user) onSuccess(user.username, data.key);
    },
    onError: (err) => setErrorMsg(String(err)),
  });

  useEffect(() => {
    setErrorMsg(null);
  }, [selectedId]);

  const candidates = usersQ.data?.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent width={420}>
        <DialogHeader>
          <strong>Add API Token</strong>
        </DialogHeader>
        <div style={{ padding: 14, display: "grid", gap: 10, fontSize: 12 }}>
          <div className="dim">
            Generate a new API token for a user. The user must not already have one.
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>User</span>
            <select
              value={selectedId === "" ? "" : String(selectedId)}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
              disabled={usersQ.isLoading || m.isPending}
            >
              <option value="">— select a user —</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </label>
          {usersQ.isLoading && <div className="dim">Loading users…</div>}
          {!usersQ.isLoading && candidates.length === 0 && (
            <div className="dim">All users already have tokens.</div>
          )}
          {errorMsg && (
            <div style={{ color: "var(--color-danger)" }}>{errorMsg}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <DialogClose asChild>
              <button type="button" className="btn ghost">Cancel</button>
            </DialogClose>
            <button
              type="button"
              className="btn primary"
              disabled={selectedId === "" || m.isPending}
              onClick={() => { if (selectedId !== "") m.mutate(selectedId); }}
            >
              {m.isPending ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 5.5 `lib/api/users.ts` 加 has_token 参数

`UserListFilters` interface 加：

```typescript
has_token?: "yes" | "no";
```

`listUsers` 函数构建 query string 加：

```typescript
if (filters.has_token) params.set("has_token", filters.has_token);
```

### 5.6 Sidebar 改动

`components/shell/Sidebar.tsx`：

```typescript
// 删 Workspace 区
- { to: "/configs", label: "Configs", icon: Icon.tag },

// 删 Admin 区
- { to: "/tokens", label: "Tokens", icon: Icon.keyRound, staffOnly: true },

// 新增 Admin 区（在 Users 与 API Docs 之间）
+ { to: "/settings", label: "Settings", icon: Icon.cog, staffOnly: true },
```

### 5.7 router.tsx 改动

```typescript
// 删
- const ConfigsRoute = lazy(() => import("./routes/configs"));
- const TokensRoute = lazy(() => import("./routes/tokens"));
- { path: "configs", element: withSuspense(<ConfigsRoute />) },
- { path: "tokens", element: withSuspense(<TokensRoute />) },

// 新增
+ const SettingsRoute = lazy(() => import("./routes/settings"));
+ { path: "settings", element: withSuspense(<SettingsRoute />) },
```

注：sub-spec #8 已用 `is_superuser` gate；本 spec 沿用。

## 6. 权限

- Backend: `IsSuperUser`（已在 sub-spec #8 T1 替换）
- Frontend: `useCurrentUser().data.is_superuser` 才进 `/settings`；否则 destructive Alert "Forbidden"
- Sidebar `staffOnly: true` 仍触发 sub-spec #8 命名兼容 gate（实际 is_superuser）

## 7. Audit

不变：`token_create` / `token_revoke` ACTIONs 由现有 `_handle_token` view 触发。Add Token 走 POST `/api/v3/users/<id>/token/` 即触发 `token_create`；Revoke 走 DELETE 触发 `token_revoke`。

## 8. 测试策略

### 8.1 后端 pytest

- `tests/web/test_apiv3_tokens_list.py`：替换 `test_tokens_list_returns_all_users_token_or_not` 为 `test_tokens_list_only_returns_users_with_tokens`（6 测试维持总数）
- `tests/web/test_apiv3_users_list.py`：新增 2 测试（`?has_token=yes` / `?has_token=no` filter）

### 8.2 前端 e2e

新建 `frontend/app/tests/e2e/settings-tokens-management.spec.mjs`（替换 `tokens-management.spec.mjs`），覆盖：

1. **Sidebar Admin > Settings link** → click → URL = `/settings`
2. **List renders heading + admin token row with mask** → 表头 "API Tokens"，admin row 有 `[a-f0-9]{4}\*\*\*\*[a-f0-9]{4}` 掩码
3. **Add Token modal full flow**: temp user (via /users/new) → /settings → click "Add Token" → modal opens with dropdown including tmpUser → select → Generate → modal closes → RevealDialog appears with full 40-hex key → Copy → Close → table row for tmpUser visible
4. **Revoke removes row**: revoke admin's row (using a temp user since admin's own token is fragile); confirm dialog → Revoke → row disappears (reverts to "no token" → not in list because list filters has_token only)
5. **Cleanup**: delete temp user via /users 单页

旧 `tokens-management.spec.mjs` 删除。

`users-management.spec.mjs` 不影响（没引用 /tokens 或 reveal flow）。

## 9. 部署 / 迁移

- 无 DB migration
- 无 conf 变更
- 部署：pytest 通过 → npm build → rsync → `cape-web` restart

## 10. Rollback

revert sub-spec #9 commits 即恢复 sub-spec #8 状态：`/configs` 重新存在（StubPage）；`/tokens` 重新可达；inline reveal/rotate/copy 回归。安全 + 无数据损失。

## 11. Open Questions / Future Work

1. Tab UI 框架：当 `/settings` 加第 2 项时（如 system config / audit retention 等）再引入 tab。当前 1 项 YAGNI。
2. Add Token modal 用 autocomplete：用户量 > 50 时考虑（当前 < 50）。
3. Token 创建时 / 撤销时增加 actor 与 target 的二级展示（"created by admin for user alice"）：audit log 已有，UI 暂不展示。

## 12. Decision Log

| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 列结构 | 3 列 / 4 含 Created / 2 列 GitHub | **3 列** | 与"只需要显示用户名"字面对齐；最简 |
| 旧 /tokens 路由 | 删 / 重定向 / 双入口 | **删除** | 显式迁移轨迹；admin 重学一次新位置 |
| /settings tab UI | 无 / 框架占位 / 多 tab | **无 tab** | 1 项内容时 YAGNI；与 sub-spec #8 单页化一致 |
| 列表语义 | 仅 has-token / 全 user | **仅 has-token** | GitHub PAT 风格；Add Token 是唯一新建路径 |
| 用户选择器范围 | 仅无 token / 全 user | **仅无 token** | 防止误覆盖现有 token；明确"Add" 不是 "Replace" |
| 用户选择器形态 | native select / autocomplete | **native select** | 当前 < 50 用户；YAGNI |
| Inline Reveal/Copy | 保留 / 删除 | **删除** | GitHub 风格；只在 Add Token modal 一次性见 |
| Mask 格式 | 6+4 / 4+****+4 / 圆点 | **4+****+4** | 用户明示要求 |
| /configs stub | 保留 / 删除 | **删除** | 用户明示删除；stub 无引用 |
| 范围拆分 | 1+2+3 合并 / 全 4 合并 | **1+2+3 一个 sub-spec** | 强耦合（同一页 UI 重做）；item 4 audit 独立 |
