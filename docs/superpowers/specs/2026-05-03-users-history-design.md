# Sub-spec #4 — `/users/<id>` History tab 设计

**Status:** approved-pending-spec-review
**Date:** 2026-05-03
**Branch:** refactor/web-spa
**Builds on:**
- sub-spec #1 (auth-strip + apiv3 user mgmt) —— `users_detail` 已是 SPA-native，audit `target_type="user"` 在所有 user 写路径已埋点
- sub-spec #2 (groups) —— group_create/update/delete audit ACTIONs 也以 user 为 target 关联
- sub-spec #3 (tokens) —— token_create/rotate/revoke audit ACTIONs 同样以 user 为 target

---

## 1. Understanding Summary

- **目标**: `/users/<id>` 详情页加第 6 个 tab "History"，列出该 user 作为 audit `target` 被影响的事件（密码改、组改、token 操作、角色变更、删除等）。
- **谁用**: `is_staff` 用户做用户运维 / 审计追溯。
- **配合现有 /audit 页**: /audit 是全局 actor/target 双向视图；本 tab 是 single-user pivot 的"何时被改了什么"。
- **关键非目标**:
  - **不改 username 编辑能力** —— username 永久只读，重命名走"创建新 user → 迁移 → 删旧"流程（用户 sub-spec #4 brainstorm Q3 选 A 明确放弃）
  - 不展示 `actor=<this user>` 的事件（"BY this user" 视角已由 /audit 全局页 `?actor=<username>` 覆盖）
  - 不加 secondary filter UI（action 多选 / time range）—— YAGNI

## 2. Assumptions

1. 现有 `useAuditEvents(filters: AuditFilters)` hook 接受任意 `AuditFilters` 注入，与 /audit 全局页能并存（独立 queryKey，独立缓存）。
2. 当前 `apiv3 audits_list` 的 `?target_user=<id>` 行为：数字 → 匹配 `target_id`；非数字 → 匹配 `target_label`。本 tab 始终传数字（user.id），所以走 target_id 路径。
3. user 删除后导航走 `/users` 列表，History tab 不存在僵尸状态。
4. 当前 `/users/<id>` 页面级 staff gate（`navigate("/", { replace: true })` if `!is_staff`）已守护本 tab，不需新增。
5. 现有 `<AuditTable events catalog>` + `<AuditRow>` + `<ActionBadge>` 组件可直接复用；不引入新组件。

## 3. 架构

```
SPA 改动
  routes/users-detail.tsx
    TABS 数组追加 "History"
    渲染分支添加 {tab === "History" && <HistoryTab user={user} />}
    新增 HistoryTab 组件（同文件内或独立文件，决策见 §5）

apiv3
  无改动（audits_list 已支持 target_user 过滤）

Audit
  无新 ACTION

DB
  无 migration
```

## 4. 后端

**零改动。** `audits_list` 现有接口已支持：

```
GET /api/v3/audits/?target_user=<user_id>&limit=50[&cursor=<id>]
```

返回包络：`{data: [...], next_cursor, total}`，`data` 行包含 `id`, `timestamp`, `actor.{user_id,username}`, `action`, `target.{type,id,label}`, `success`, `ip`, `extra`。

## 5. 前端

### 5.1 文件清单

```
frontend/app/src/
  components/users/HistoryTab.tsx     新建 (~80 lines)
  routes/users-detail.tsx             Modify (+5 lines: TABS 追加 + 渲染分支 + import)
```

**决策：** 抽出独立文件 `HistoryTab.tsx`，不内联到 `users-detail.tsx`。理由：
- `users-detail.tsx` 已 ~280 行，再加 80 行接近 400 行，按 codebase "高内聚低耦合" 原则切分
- 与 `TokenSection.tsx` / `SetPasswordModal.tsx` 等同级别复用模式一致

### 5.2 TABS 数组追加

`routes/users-detail.tsx:17`：

```typescript
// Before
const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile"] as const;
// After
const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile", "History"] as const;
```

`routes/users-detail.tsx:82-86` 渲染分支追加一行：

```tsx
{tab === "History" && <HistoryTab user={user} />}
```

并在文件顶部 import：

```typescript
import { HistoryTab } from "@/components/users/HistoryTab";
```

### 5.3 HistoryTab 组件

`frontend/app/src/components/users/HistoryTab.tsx`：

```tsx
import { useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { AuditTable } from "@/components/audit/AuditTable";
import { useAuditActions } from "@/hooks/useAuditActions";
import { useAuditEvents } from "@/hooks/useAuditEvents";
import type { AuditEvent, AuditFilters } from "@/lib/api/audits";
import type { UserDetail } from "@/lib/api/users";

interface Props {
  user: UserDetail;
}

export function HistoryTab({ user }: Props) {
  const filters: AuditFilters = useMemo(
    () => ({ target_user: String(user.id) }),
    [user.id],
  );

  const eventsQuery = useAuditEvents(filters);
  const actionsQuery = useAuditActions();

  const events: AuditEvent[] = useMemo(
    () => eventsQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [eventsQuery.data],
  );

  if (eventsQuery.isLoading || actionsQuery.isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <Spinner size={14} />
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load history</AlertTitle>
        <AlertDescription>{String(eventsQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  if (events.length === 0) {
    return (
      <div className="dim" style={{ padding: 24, fontSize: 12 }}>
        No audit events recorded for this user yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AuditTable events={events} catalog={actionsQuery.data ?? []} />
      {eventsQuery.hasNextPage && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="btn ghost"
            disabled={eventsQuery.isFetchingNextPage}
            onClick={() => eventsQuery.fetchNextPage()}
          >
            {eventsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
```

### 5.4 URL state

History tab 自身**不参与 URL state sync**。`/users/<id>?tab=...` 当前在 users-detail.tsx 不管理 tab 状态到 URL（tab 状态是组件内 useState，刷新后回 "Basic"）。本 spec 不引入 tab → URL 同步，与现状一致；想要分享深链的需求未来另立。

### 5.5 Empty / Loading / Error 状态

- **Loading**: 居中 14px Spinner（与 /audit 一致）
- **Error**: 红色 destructive Alert "Failed to load history" + error 字符串
- **Empty**: dim 文案 "No audit events recorded for this user yet."（用户刚创建 / 历史已 GC 时常见）

### 5.6 列展示

直接复用 `AuditTable`：Time / Actor / Action / Target / IP / Expand。其中 Target 列对本 tab 必然是 self（target_id=user.id），仍照常展示（保持表格 schema 不变；不做特殊隐藏列优化以避免引入复用层 if）。

## 6. 权限

- 后端 `audits_list` 是 `IsAdminUser`
- 前端 `/users/<id>` 页面级 gate 已是 is_staff，HistoryTab 无需额外守卫

## 7. 测试策略

### 7.1 后端 pytest

**零新测试**（audits_list 的 target_user filter 已有 coverage 在 `tests/test_apiv3_audits.py` —— 验证通过 grep 即可）。

### 7.2 前端 e2e

新增 1 个 Playwright 测试到 `frontend/app/tests/e2e/users-management.spec.mjs`（追加，不新建文件）：

```javascript
test("/users/<id> History tab shows audit events", async ({ page }) => {
  // 1. login as admin
  // 2. navigate to /users/<some-existing-user>
  // 3. click "History" tab
  // 4. expect either: AuditTable visible with at least 1 row,
  //    OR "No audit events recorded for this user yet." dim text.
  //    (admin 自身大概率有 audit 行；新建临时 user 大概率 empty。
  //    用 admin 自身做断言，因为 sub-spec #1/#2/#3 必然产生过涉及 admin 的事件。)
});
```

理由：tab 切换 + audit 数据加载是核心 contract，1 个 happy-path 测试足够；error/empty 状态留给 unit test（本 spec 不涉及）或人工 QA。

## 8. 部署 / 迁移

- **无 DB migration**
- **无 conf 变更**
- 部署只需：`npm run build` → rsync → `systemctl restart cape-web`

## 9. Rollback

单一 commit；revert 即下线 History tab，零副作用。

## 10. Open Questions / Future Work

1. **Tab → URL state**：跨 tab 深链分享场景出现后再加 `?tab=History` 同步。
2. **BY this user 视角**：如有运维诉求"看这个 user 自己做了什么"，可加第二层 sub-tab 或独立 ActorTab；目前用户走 /audit 全局 + `?actor=<username>` 已能解决。
3. **Username 重命名**：当前接受"创建新 user → 迁移引用 → 删旧"流程；如未来需要原子 rename，需独立 spec 评估对 audit log `actor_username` / `target_label`（历史已写死字符串）的回填策略。
4. **Audit 历史 GC**：当前 audit_log 无自动归档；超大量数据时单 user 历史拉取性能未评估。

## 11. Decision Log

| 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|
| 事件范围 | ABOUT / BY / 两者 | ABOUT (target_user filter) | 与"该 user 发生了什么"的 Tab 语义对齐；BY 视角全局 /audit 已覆盖 |
| Filter UI 粒度 | 极简 / 加 action+time / 完整复用 | 极简（无 filter bar） | YAGNI；用户已在该 tab 即等同 target_user 锁定 |
| Username 可编辑 | 就地 / Modal / 禁止 | **禁止**（永久只读） | 用户 brainstorm Q3 选 A 明确放弃，接受"创建新 user → 迁移 → 删旧"流程 |
| Tab 位置 | 末尾 / 第二位 | 末尾（顺序追加） | 不打乱现有 5 tab 心智 |
| HistoryTab 抽文件 | 内联到 users-detail / 抽出 | 抽出（component/users/HistoryTab.tsx） | users-detail.tsx 已 ~280 行，与 TokenSection 同级粒度 |
| 后端改动 | 新增 endpoint / 复用 audits_list | 复用 | 0 后端改动 = 0 风险 |
| 测试范围 | 1 e2e / 1 e2e + unit / 全套 | 1 e2e（追加到 users-management.spec.mjs） | 本 spec 改动量小，1 happy path 即覆盖核心 contract |
