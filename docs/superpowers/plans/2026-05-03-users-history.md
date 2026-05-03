# `/users/<id>` History Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6th tab "History" to `/users/<id>` that lists audit events for which this user is the `target` (password resets, group/permission changes, token operations, deletions, etc.). Reuses existing `audits_list` endpoint and frontend audit components — zero backend / DB / audit-action changes.

**Architecture:** New `<HistoryTab user>` component pivots `useAuditEvents({ target_user: String(user.id) })` into the existing `<AuditTable>`. The component is rendered conditionally inside `routes/users-detail.tsx` when the active tab is `"History"`. URL → tab sync is unchanged (still in-component `useState`). Username remains read-only (the original sub-spec #4 "username editable" item was dropped during brainstorm).

**Tech Stack:** React 18 / TanStack Query v5 (`useInfiniteQuery`) / Vite / Playwright. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-03-users-history-design.md` (commit `93700fc9`)

**Branch:** `refactor/web-spa` (HEAD before this plan: `93700fc9`)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `frontend/app/src/components/users/HistoryTab.tsx` | Per-user audit list (loading / empty / error / table + Load more) | Create (~80 lines) |
| `frontend/app/src/routes/users-detail.tsx` | Add `"History"` to TABS, render `<HistoryTab>` when active | Modify (3 small edits: import, TABS array, render branch) |
| `frontend/app/tests/e2e/users-management.spec.mjs` | Append 1 test exercising the History tab | Modify (~15-20 LOC append) |

---

## Task A1: HistoryTab component + users-detail integration

**Files:**
- Create: `frontend/app/src/components/users/HistoryTab.tsx`
- Modify: `frontend/app/src/routes/users-detail.tsx` (lines 7, 17, ~85)

**Context for the implementer:** Read these files before editing for pattern alignment:
- `frontend/app/src/routes/audit.tsx:35-130` — shows the canonical consumption pattern of `useAuditEvents` + `useAuditActions` + `<AuditTable>`. `catalog = actionsQuery.data?.data ?? []` (NOT `actionsQuery.data ?? []` — `AuditActionListResponse` wraps the array in `{data: [...]}`).
- `frontend/app/src/components/users/TokenSection.tsx` — peer component pattern (takes a single `user`-derived prop, owns its own queries/mutations).
- `frontend/app/src/components/audit/AuditTable.tsx` — the public component signature is `<AuditTable events={AuditEvent[]} catalog={AuditActionDescriptor[]} />`.

The history tab MUST always pass `target_user` as a stringified user id — backend `audits_list` (`web/apiv3/views.py:2061-2067`) routes string-numeric values through `target_id` (precise match) and non-numeric strings through `target_label` (fuzzy match). We always want precise, so always stringify.

- [ ] **Step 1: Create `frontend/app/src/components/users/HistoryTab.tsx`**

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

  const catalog = actionsQuery.data?.data ?? [];

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
      <AuditTable events={events} catalog={catalog} />
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

- [ ] **Step 2: Add `HistoryTab` import to `frontend/app/src/routes/users-detail.tsx`**

In the existing `import` block (lines 5-15), insert this line right after the existing `import { TokenSection } from "@/components/users/TokenSection";` line:

```typescript
import { HistoryTab } from "@/components/users/HistoryTab";
```

The import block must remain alphabetically sorted within the `@/components/users/` group (existing order: `GroupsPicker`, `PermissionsPicker`, `SetPasswordModal`, `TokenSection`). `HistoryTab` slots in alphabetically before `PermissionsPicker`, but matching codebase practice we prioritise grouping over strict alpha — keep it next to `TokenSection` so all per-user-tab components live adjacent.

- [ ] **Step 3: Extend the `TABS` constant in `frontend/app/src/routes/users-detail.tsx:17`**

Change:

```typescript
const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile"] as const;
```

to:

```typescript
const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile", "History"] as const;
```

- [ ] **Step 4: Add the render branch for the History tab**

Find the existing tab-render block in `frontend/app/src/routes/users-detail.tsx` (around line 82-86):

```tsx
{tab === "Basic" && <BasicTab user={user} />}
{tab === "Groups" && <GroupsPicker user={user} />}
{tab === "Permissions" && <PermissionsTab user={user} />}
{tab === "API Token" && <TokenSection userId={user.id} username={user.username} />}
{tab === "Profile" && <ProfileTab user={user} />}
```

Append exactly one new line at the end of this block:

```tsx
{tab === "History" && <HistoryTab user={user} />}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck
```

Expected: clean. If `HistoryTab` is reported as unused you missed Step 4. If `Props` type errors appear in `HistoryTab.tsx`, recheck the imports — `AuditEvent` / `AuditFilters` come from `@/lib/api/audits`; `UserDetail` from `@/lib/api/users`.

- [ ] **Step 6: Build + deploy + manual smoke**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run build 2>&1 | tail -3
cd /Users/lamba/github/cape
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S chown -R ubuntu:ubuntu /opt/CAPEv2/web/static/spa'
sshpass -p ubuntu rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" frontend/app/dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web/static/spa && echo ubuntu | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "/users/1 → %{http_code}\n" http://192.168.1.6:8000/users/1
```

Expected: `built in <Ns>`, anonymous probe returns `302` (login redirect — same as every authed SPA route).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/src/components/users/HistoryTab.tsx frontend/app/src/routes/users-detail.tsx
git commit -m "feat(spa): /users/<id> History tab — per-user audit log view"
```

---

## Task B1: e2e + push

**Files:**
- Modify: `frontend/app/tests/e2e/users-management.spec.mjs` (append 1 test inside the existing `test.describe.configure({ mode: "serial" })` flow)

**Context for the implementer:** Read `frontend/app/tests/e2e/users-management.spec.mjs:1-30` for the exact `login()` helper and env-var conventions (`PARITY_SPA_URL` / `SPA_LOGIN_USER` / `SPA_LOGIN_PASS`, default `cape123!`). Tests are configured serial — the new test runs after `create + edit + delete e2e-tmp user` and the avatar-dropdown one. Use the admin user (`USER` constant — guaranteed to have audit events from sub-spec #1/#2/#3 work).

The History tab fires two queries on mount: `useAuditEvents({target_user: <admin id>})` and `useAuditActions()`. The admin user is id `1` in this deployment (confirmed earlier in the session). Reaching the page through `/users` list → click admin row is more robust than hard-coding `/users/1` because the session test order is preserved and the row-click pattern is already used elsewhere in the file.

- [ ] **Step 1: Append the new test to `frontend/app/tests/e2e/users-management.spec.mjs`**

Locate the end of the file (after the last `test(...)` block — the avatar dropdown test that ends around line 80-100). Append exactly:

```javascript

test("/users/<id> History tab loads audit events for admin", async ({ page }) => {
  await login(page);
  // Navigate to admin's own detail page through the list (more robust than
  // hard-coding /users/1).
  await page.goto(`${SPA}/users?search=${encodeURIComponent(USER)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: USER }).first().click();
  await page.waitForURL(/\/users\/\d+/, { timeout: 10000 });

  // Click the History tab.
  await page.getByRole("button", { name: "History" }).click();

  // Wait for either an AuditTable row OR the empty-state copy. Admin
  // has had several audit events generated during sub-spec #1/#2/#3
  // implementation, so the table path is the realistic one — but we
  // accept either to keep the test robust against fresh deployments.
  await page.waitForFunction(
    () => {
      const rows = document.querySelectorAll("table.data tbody tr");
      const empty = Array.from(document.querySelectorAll("div"))
        .some((d) => /No audit events recorded/i.test(d.textContent ?? ""));
      return rows.length > 0 || empty;
    },
    { timeout: 8000 },
  );

  // Either branch is acceptable; assert at least one is true.
  const rows = await page.locator("table.data tbody tr").count();
  if (rows === 0) {
    await expect(
      page.getByText(/No audit events recorded for this user yet/),
    ).toBeVisible();
  } else {
    expect(rows).toBeGreaterThan(0);
  }
});
```

The trailing newline at the start is intentional — it separates the new test from the previous one with a blank line, matching the file's existing rhythm.

- [ ] **Step 2: Run the new e2e against the live SPA**

```bash
cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS=cape123! \
  npx playwright test tests/e2e/users-management.spec.mjs --reporter=line
```

Expected: 4/4 pass (the existing 3 + this 1).

If the new test fails:
- If `getByRole("button", { name: "History" })` times out → check that A1 Step 4 actually added the render branch and the deployed bundle is current. Re-run A1 Step 6's deploy block.
- If the table assertion fails → check whether admin has any audit events. Run on the remote box: `sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -c "import django; django.setup(); from audit_log.models import AuditEvent; print(AuditEvent.objects.filter(target_type=\"user\", target_id=\"1\").count())"' 2>&1 | tail -5` — if 0, adjust the test to accept the empty-state branch (the test already does this; this is a debugging breadcrumb).
- Do NOT skip / `.skip` / `.only` the test; either fix the SPA or fix the test rationale.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/lamba/github/cape
git add frontend/app/tests/e2e/users-management.spec.mjs
git commit -m "test(spa): /users/<id> History tab e2e"
git push origin refactor/web-spa
```

Expected: 2 new commits land on `origin/refactor/web-spa` (Task A1 + Task B1).

---

## Self-Review Notes (controller filled — do not action)

**Spec coverage:**
- Spec §3 architecture (TABS extension + new component) → Task A1 Steps 2-4
- Spec §4 backend (zero changes) → not in plan (no work needed)
- Spec §5.1 file clean-list (1 new + 1 modified) → Task A1
- Spec §5.3 HistoryTab code → Task A1 Step 1 (with `actionsQuery.data?.data ?? []` correction relative to spec)
- Spec §5.5 loading/empty/error states → Task A1 Step 1 includes all three branches verbatim
- Spec §6 permissions (rely on existing /users/<id> page-level gate) → no extra task
- Spec §7.2 e2e → Task B1
- Spec §10/§11 future work and decision log → not in plan (documentation only)

**Placeholder scan:** clean — every step has explicit code, exact commands, and expected output.

**Type consistency:** `HistoryTab` props `{user: UserDetail}` (Step 1) match `<HistoryTab user={user} />` call site (Step 4). `AuditFilters.target_user: string` (existing type, verified in `frontend/app/src/lib/api/audits.ts:51-72`) matches `String(user.id)` cast. `AuditTable` accepts `AuditActionDescriptor[]` (verified in `frontend/app/src/components/audit/AuditTable.tsx:7`); `actionsQuery.data?.data` resolves to that exact type per `AuditActionListResponse {data: AuditActionDescriptor[]}`.

**Spec deviation flagged:** Spec §5.3 had `actionsQuery.data ?? []` which would pass a wrapper object instead of an array; plan Step 1 corrects to `actionsQuery.data?.data ?? []` matching `routes/audit.tsx:68`. This is a typo in the spec, not an architectural change.
