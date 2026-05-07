# Tokens → /settings Implementation Plan (sub-spec #9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-level `/tokens` route with a new `/settings` route hosting GitHub-PAT-style token management — 3-column list (Username / masked Token / Revoke), inline reveal/copy/rotate removed, and a new "Add Token" modal that picks a no-token user and shows the freshly issued key once.

**Architecture:** Backend reverts sub-spec #8 T3 by re-filtering `tokens_list` to `auth_token__isnull=False` and adds a `has_token` query param to `users_list` for the modal's user dropdown. Frontend deletes `/configs` (stub) and `/tokens` routes, adds `/settings` (no tab UI), rewrites `TokenListTable` (3 columns, mask `XXXX****YYYY`, only Revoke), and introduces `AddTokenModal` that calls existing `POST /api/v3/users/<id>/token/`.

**Tech Stack:** Django 5 / DRF (host); React 18 / Vite / TanStack Query v5 / radix-ui Dialog / Playwright (web).

**Spec:** `docs/superpowers/specs/2026-05-07-tokens-into-settings-design.md` (commit `976b33a0`)

**Branch:** `refactor/web-spa` (HEAD before this plan: `976b33a0`)

**Live test box:** `192.168.2.240` (cape/cape, admin/admin) — see memory `test_box_240.md`. cape-web on `0.0.0.0:8000`.

---

## File Structure

| Layer | File | Action |
|---|---|---|
| Backend | `web/apiv3/views.py` | `tokens_list`: re-add `auth_token__isnull=False` filter; `users_list`: add `has_token` query param + `OpenApiParameter` |
| Backend | `tests/web/test_apiv3_tokens_list.py` | Replace `test_tokens_list_returns_all_users_token_or_not` with `test_tokens_list_only_returns_users_with_tokens` |
| Backend | `tests/web/test_apiv3_users_list.py` | Add 2 tests for `?has_token=yes` / `?has_token=no` |
| FE delete | `frontend/app/src/routes/configs.tsx` | Delete (stub) |
| FE delete | `frontend/app/src/routes/tokens.tsx` | Delete |
| FE delete | `frontend/app/tests/e2e/tokens-management.spec.mjs` | Delete (replaced by new spec file) |
| FE create | `frontend/app/src/routes/settings.tsx` | New page (no tab UI; hosts Tokens content + Add button) |
| FE create | `frontend/app/src/components/tokens/AddTokenModal.tsx` | New modal (user dropdown via `?has_token=no` + Generate) |
| FE create | `frontend/app/tests/e2e/settings-tokens-management.spec.mjs` | New e2e spec |
| FE modify | `frontend/app/src/components/tokens/TokenListTable.tsx` | Rewrite: 3 cols, drop reveal/copy/rotate, mask `XXXX****YYYY` |
| FE modify | `frontend/app/src/router.tsx` | Drop /configs + /tokens; register /settings |
| FE modify | `frontend/app/src/components/shell/Sidebar.tsx` | Drop Workspace/Configs + Admin/Tokens; add Admin/Settings (cog icon) |
| FE modify | `frontend/app/src/lib/api/users.ts` | Add `has_token: "yes" \| "no"` to `UserListFilters` |

---

## Task T1: Backend — tokens_list filter revert + users_list has_token param

**Files:**
- Modify: `web/apiv3/views.py` (`tokens_list` queryset + `users_list` query param parsing + `OpenApiParameter`)
- Modify: `tests/web/test_apiv3_tokens_list.py` (replace 1 test)
- Modify: `tests/web/test_apiv3_users_list.py` (add 2 tests)

**Context for the implementer:**
- `tokens_list` was modified by sub-spec #7 (added `auth_token__isnull=False` filter), then sub-spec #8 T3 removed it. This task re-adds it.
- `users_list` is the canonical user listing endpoint; it currently supports `search`, `is_staff`, `is_superuser`, `is_active`, `group`, `cursor`, `limit`, `ordering`. We add `has_token`.
- `UserListSerializer` already returns `has_token: bool` per row — no serializer change needed; only the filter logic.

- [ ] **Step 1: Add the failing test for tokens_list filter**

In `tests/web/test_apiv3_tokens_list.py`, find `test_tokens_list_returns_all_users_token_or_not` (added by sub-spec #8 T3). Replace it with:

```python
@pytest.mark.django_db
def test_tokens_list_only_returns_users_with_tokens(admin_client):
    c, _admin = admin_client  # admin has token (fixture creates it)
    User.objects.create_user(username="bob")  # no token
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    rows = resp.json()["data"]
    usernames = {row["username"] for row in rows}
    # bob has no token — must NOT appear.
    assert usernames == {"adm-tk", "alice"}
    # Both rows have full 40-char hex key.
    for row in rows:
        assert isinstance(row["key"], str) and len(row["key"]) == 40
```

The `_only_returns` test name + assertion replaces the `_returns_all_users` one. Other 5 tests unchanged.

- [ ] **Step 2: Add 2 failing tests for users_list has_token filter**

Append to `tests/web/test_apiv3_users_list.py` (file already exists; check for an existing `admin_client` fixture and reuse it):

```python
@pytest.mark.django_db
def test_users_list_filter_has_token_yes(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob")  # no token

    resp = c.get("/api/v3/users/?has_token=yes")
    usernames = {row["username"] for row in resp.json()["data"]}
    # bob excluded.
    assert "bob" not in usernames
    assert {"alice"} <= usernames


@pytest.mark.django_db
def test_users_list_filter_has_token_no(admin_client):
    c, admin = admin_client
    Token.objects.create(user=admin)
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)
    User.objects.create_user(username="bob")  # no token

    resp = c.get("/api/v3/users/?has_token=no")
    usernames = {row["username"] for row in resp.json()["data"]}
    # alice + admin excluded.
    assert "alice" not in usernames
    assert "bob" in usernames
```

Verify `Token` is already imported at top of `tests/web/test_apiv3_users_list.py`. If not, add: `from rest_framework.authtoken.models import Token`.

- [ ] **Step 3: Run tests — they MUST fail**

Stage to 240 + run:

```bash
sshpass -p cape rsync -a -e "ssh -o StrictHostKeyChecking=no" \
  tests/web/test_apiv3_tokens_list.py tests/web/test_apiv3_users_list.py \
  cape@192.168.2.240:/opt/CAPEv2/staged-T1/

sshpass -p cape ssh cape@192.168.2.240 'cp /opt/CAPEv2/staged-T1/test_apiv3_tokens_list.py /opt/CAPEv2/tests/web/test_apiv3_tokens_list.py && cp /opt/CAPEv2/staged-T1/test_apiv3_users_list.py /opt/CAPEv2/tests/web/test_apiv3_users_list.py'

sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_tokens_list.py tests/web/test_apiv3_users_list.py -v 2>&1 | tail -15'
```

Expected: at least 3 failures (1 in tokens_list — bob shouldn't appear; 2 in users_list — has_token filter not implemented).

- [ ] **Step 4: Re-add `auth_token__isnull=False` filter in `tokens_list`**

In `web/apiv3/views.py`, find `tokens_list` (around line 720-770). Modify the queryset construction:

```python
# Before (sub-spec #8 T3 state)
qs = User.objects.select_related("auth_token").order_by("id")

# After (sub-spec #9)
qs = (
    User.objects.select_related("auth_token")
    .filter(auth_token__isnull=False)
    .order_by("id")
)
```

Update the `extend_schema` description to: `"Returns only users with active API tokens. Each row includes the full token key for admin reveal/copy in the issuance modal."` (or similar — match sub-spec #7's wording if you have it handy).

- [ ] **Step 5: Add `has_token` query param to `users_list`**

In `web/apiv3/views.py`, find `users_list` GET branch (around line 350-450). After existing filter blocks (`search`, `is_staff`, `is_superuser`, `is_active`, `group`), add:

```python
has_token = request.query_params.get("has_token")
if has_token == "yes":
    qs = qs.filter(auth_token__isnull=False)
elif has_token == "no":
    qs = qs.filter(auth_token__isnull=True)
```

Add `OpenApiParameter` to the existing `extend_schema` `parameters` list (alphabetical with the others):

```python
OpenApiParameter(
    name="has_token", type=OpenApiTypes.STR, required=False,
    enum=["yes", "no"],
    description="Filter users by whether they have an API token.",
),
```

- [ ] **Step 6: Run tests — all must pass**

```bash
sshpass -p cape rsync -a -e "ssh -o StrictHostKeyChecking=no" \
  web/apiv3/views.py \
  cape@192.168.2.240:/opt/CAPEv2/staged-T1/

sshpass -p cape ssh cape@192.168.2.240 'cp /opt/CAPEv2/staged-T1/views.py /opt/CAPEv2/web/apiv3/views.py'

sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_tokens_list.py tests/web/test_apiv3_users_list.py -v 2>&1 | tail -15'
```

Expected: all targeted tests pass.

- [ ] **Step 7: Run full apiv3 suite — no regressions**

```bash
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2 && /etc/poetry/bin/poetry run python -m pytest tests/web/test_apiv3_*.py -q 2>&1 | tail -10'
```

Expected: pre-existing baseline (post-sub-spec #8 was 80) ± new tests (≥ 82 passed).

- [ ] **Step 8: Restart cape-web on 240 + smoke**

```bash
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web && sleep 3'
```

- [ ] **Step 9: Commit**

```bash
git add web/apiv3/views.py tests/web/test_apiv3_tokens_list.py tests/web/test_apiv3_users_list.py
git commit -m "feat(apiv3): tokens_list filter to has-token + users_list has_token query param"
```

---

## Task T2: Frontend — `/settings` route + AddTokenModal + TokenListTable rewrite + sidebar/router cleanup

**Files:**
- Delete: `frontend/app/src/routes/configs.tsx`
- Delete: `frontend/app/src/routes/tokens.tsx`
- Create: `frontend/app/src/routes/settings.tsx`
- Create: `frontend/app/src/components/tokens/AddTokenModal.tsx`
- Modify: `frontend/app/src/components/tokens/TokenListTable.tsx`
- Modify: `frontend/app/src/router.tsx`
- Modify: `frontend/app/src/components/shell/Sidebar.tsx`
- Modify: `frontend/app/src/lib/api/users.ts`

**Context for the implementer:**
- `/configs` is a `StubPage` with no real implementation — safe delete.
- `/tokens` was rewritten in sub-spec #7 and partially reverted in sub-spec #8 T5 — it's the page being replaced. Read its current state in `frontend/app/src/routes/tokens.tsx` for the structural template; the new `routes/settings.tsx` is similar but adds an Add Token button and removes Generate inline.
- `TokenListTable` after sub-spec #8 T5 has both has-token (mono mask + reveal/copy + Rotate/Revoke) and no-token (`⊘ None` + `[Generate]`) branches. Sub-spec #9 simplifies to has-token only with NO reveal/copy and only Revoke.
- `TokenRevealDialog` (added sub-spec #7) is preserved — `AddTokenModal` reuses it for the one-shot reveal after Generate succeeds.
- `Icon.cog` exists in `frontend/app/src/components/shell/icons.tsx` — use for the Settings sidebar entry.
- `Icon.keyRound` and `Icon.tag` (Configs) are no longer used in Sidebar after this task; the icon registry entries can stay (they're harmless if unused).

- [ ] **Step 1: Delete `/configs` and `/tokens` routes**

```bash
cd /Users/lamba/github/cape
git rm frontend/app/src/routes/configs.tsx
git rm frontend/app/src/routes/tokens.tsx
```

- [ ] **Step 2: Update `frontend/app/src/lib/api/users.ts`**

Find the `UserListFilters` interface (lines 20-29). Add the `has_token` field:

```typescript
export interface UserListFilters {
  search?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  group?: string;
  has_token?: "yes" | "no";
  cursor?: number;
  limit?: number;
  ordering?: string;
}
```

The existing `listUsers` implementation uses `Object.entries(filters)` and stringifies — `has_token: "no"` works without further changes.

- [ ] **Step 3: Rewrite `frontend/app/src/components/tokens/TokenListTable.tsx`**

Replace the file's entire contents with:

```tsx
import { Link } from "react-router-dom";

import type { AdminTokenRow } from "@/lib/api/tokens";

interface Props {
  rows: AdminTokenRow[];
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}

function maskToken(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export function TokenListTable({ rows, onRevoke, pendingUserId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="dim" style={{ padding: 16 }}>
        No active tokens.
      </div>
    );
  }
  return (
    <table className="data" style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 200 }}>Username</th>
          <th>Token</th>
          <th style={{ width: 140 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const busy = pendingUserId === row.user_id;
          return (
            <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
              <td>
                <Link to={`/users/${row.user_id}`} style={{ fontWeight: 600 }}>
                  {row.username}
                </Link>
              </td>
              <td>
                <code
                  className="mono"
                  style={{
                    padding: "3px 6px",
                    background: "var(--color-bg-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 3,
                    wordBreak: "break-all",
                  }}
                >
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
          );
        })}
      </tbody>
    </table>
  );
}
```

This rewrite drops: `Eye/EyeOff/Copy` lucide imports, `useState<Set<number>>(revealedIds)`, `toggleReveal`, `copy()` helper, `useToast` import, `onGenerate` / `onRotate` props, the `Email` and `Created` columns, and the no-token branch (`⊘ None` + Generate button). Result: ~60 lines vs prior ~140.

- [ ] **Step 4: Create `frontend/app/src/components/tokens/AddTokenModal.tsx`**

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
              onChange={(e) =>
                setSelectedId(e.target.value ? Number(e.target.value) : "")
              }
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
              onClick={() => {
                if (selectedId !== "") m.mutate(selectedId);
              }}
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

- [ ] **Step 5: Create `frontend/app/src/routes/settings.tsx`**

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
              API Tokens{" "}
              <span className="dim" style={{ fontSize: 11 }}>({total})</span>
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
      {addOpen && (
        <AddTokenModal
          onClose={() => setAddOpen(false)}
          onSuccess={onAddSuccess}
        />
      )}
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

- [ ] **Step 6: Update `frontend/app/src/router.tsx`**

a) Find and DELETE these lazy imports (anywhere in the file):

```typescript
const ConfigsRoute = lazy(() => import("./routes/configs"));
const TokensRoute = lazy(() => import("./routes/tokens"));
```

b) Find and DELETE these route entries (in the `children` array):

```typescript
{ path: "configs", element: withSuspense(<ConfigsRoute />) },
{ path: "tokens", element: withSuspense(<TokensRoute />) },
```

c) Add a new lazy import:

```typescript
const SettingsRoute = lazy(() => import("./routes/settings"));
```

d) Add the new route entry in the `children` array (place it next to other admin routes — e.g., after `users/new`):

```typescript
{ path: "settings", element: withSuspense(<SettingsRoute />) },
```

After edits: `grep -E "configs|tokens" frontend/app/src/router.tsx` returns zero matches.

- [ ] **Step 7: Update `frontend/app/src/components/shell/Sidebar.tsx`**

a) In the `NAV_ITEMS` (Workspace) array, DELETE the line:

```typescript
{ to: "/configs", label: "Configs", icon: Icon.tag },
```

b) In the `ADMIN_ITEMS` array, DELETE the line:

```typescript
{ to: "/tokens", label: "Tokens", icon: Icon.keyRound, staffOnly: true },
```

c) In the `ADMIN_ITEMS` array, ADD (between `/users` and `/docs`):

```typescript
{ to: "/settings", label: "Settings", icon: Icon.cog, staffOnly: true },
```

After edits: the Sidebar source contains no `/configs` or `/tokens` paths; contains exactly one `/settings`.

- [ ] **Step 8: Typecheck + build**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
```

Expected: typecheck clean, `built in <Ns>`.

If typecheck fails:
- "Cannot find module './routes/configs'" or "./routes/tokens'" → router.tsx still has stale lazy import; Step 6a not complete.
- "Property 'has_token' does not exist on type 'UserListFilters'" → Step 2 not applied.
- "Property 'onGenerate' is missing in type" → some consumer of the old TokenListTable signature still in tree; only `routes/tokens.tsx` (deleted) used the multi-callback variant. Verify with `grep -rn "TokenListTable" frontend/app/src/` — should match `settings.tsx` only.

- [ ] **Step 9: Deploy + smoke**

```bash
cd /Users/lamba/github/cape
sshpass -p cape rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" \
  frontend/app/dist/ cape@192.168.2.240:/opt/CAPEv2/web/static/spa/
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "/settings → %{http_code}\n/tokens → %{http_code}\n/configs → %{http_code}\n" \
  http://192.168.2.240:8000/settings \
  http://192.168.2.240:8000/tokens \
  http://192.168.2.240:8000/configs
```

Expected:
- `/settings → 302` (anon redirect to login; SPA route registered)
- `/tokens → 302` (anon redirect; the SPA's own `<NotFound>` will then 404 client-side after login)
- `/configs → 302` (same — anon redirect; SPA NotFound after login)

Note: server-side smart_404 middleware does NOT 404 these because they hit the SPA fallback view (auth required first, then SPA shell renders client-side NotFound). All 302 codes are correct.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/app/src/
git commit -m "feat(spa): /settings page hosts tokens — drop /configs + /tokens routes; GitHub-PAT-style table; AddTokenModal"
```

---

## Task T3: e2e — settings-tokens-management.spec.mjs + push

**Files:**
- Delete: `frontend/app/tests/e2e/tokens-management.spec.mjs`
- Create: `frontend/app/tests/e2e/settings-tokens-management.spec.mjs`

**Context for the implementer:**
- Replace the entire old spec file (sub-spec #8 T5 left it with 4 tests). New spec has 4 tests covering the new flow. Use the same login helper + env-var conventions (`PARITY_SPA_URL` / `SPA_LOGIN_USER` / `SPA_LOGIN_PASS`, defaults `http://192.168.2.240:8000` / `admin` / `admin`).
- Admin's existing token (DRF default `83f3246c…b4ef1`) is still on box 240; test 2 relies on it.
- The temp user e2e flow goes through Add Token modal (no more inline Generate button).

- [ ] **Step 1: Delete old spec file**

```bash
cd /Users/lamba/github/cape
git rm frontend/app/tests/e2e/tokens-management.spec.mjs
```

- [ ] **Step 2: Create `frontend/app/tests/e2e/settings-tokens-management.spec.mjs`**

```javascript
/**
 * /settings — tokens admin (sub-spec #9):
 * 3-column GitHub-PAT-style list (Username | Token mask | Revoke),
 * Add Token modal opens with a no-token-user dropdown, Generate
 * triggers RevealDialog with full key once, list refreshes.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.2.240:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "admin";

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

test("Sidebar Admin > Settings link visible to staff", async ({ page }) => {
  await login(page);
  const link = page.getByRole("link", { name: /^Settings$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/settings");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${SPA}/settings(\\?.*)?$`));
});

test("/settings list renders heading + admin row with masked token (4*4)", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/settings`);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { name: /API Tokens/ }).first()).toBeVisible();
  // Admin row present; mask format is exactly 4 + **** + 4 = 12 chars.
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  await expect(adminRow.locator("code").first()).toHaveText(/^[a-f0-9]{4}\*{4}[a-f0-9]{4}$/);
  // No Reveal/Copy/Rotate buttons on the row — only Revoke.
  await expect(adminRow.getByRole("button", { name: "Reveal" })).toHaveCount(0);
  await expect(adminRow.getByRole("button", { name: "Copy" })).toHaveCount(0);
  await expect(adminRow.getByRole("button", { name: "Rotate" })).toHaveCount(0);
  await expect(adminRow.getByRole("button", { name: "Revoke" })).toBeVisible();
});

test("Add Token modal: select no-token user → Generate → RevealDialog → list shows new row", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new (single-page form post sub-spec #8).
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. /settings → click "Add Token" → modal opens.
  await page.goto(`${SPA}/settings`);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Add Token/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  // 3. Dropdown contains tmpUser (no-token user).
  await expect(modal.locator("select")).toBeVisible();
  await modal.locator("select").selectOption({ label: tmpUser });

  // 4. Generate → modal closes → RevealDialog opens with full 40-hex key.
  await modal.getByRole("button", { name: /^Generate$/ }).click();
  // First modal closes; the next visible dialog is the reveal one.
  // Wait for the code element with 40 hex chars to appear in any dialog.
  await expect(
    page.locator('[role="dialog"] code').filter({ hasText: /^[a-f0-9]{40}$/ }),
  ).toBeVisible({ timeout: 8000 });
  // Close the reveal dialog.
  await page
    .locator('[role="dialog"]')
    .filter({ hasText: /Token generated/ })
    .getByRole("button", { name: "Close" })
    .last()
    .click();

  // 5. Settings list refreshed — tmpUser row visible with masked token.
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible({ timeout: 8000 });
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{4}\*{4}[a-f0-9]{4}$/);

  // 6. Revoke removes the row from the list (has-token-only filter).
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row).toBeHidden({ timeout: 8000 });

  // 7. Cleanup: delete temp user via /users → detail page → Delete.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});

test("/tokens and /configs routes are removed (SPA NotFound after login)", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  // SPA renders client-side NotFound — page should not contain "API Tokens" heading.
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { name: /API Tokens/ })).toHaveCount(0);
  await page.goto(`${SPA}/configs`);
  await page.waitForTimeout(1500);
  // No "Extracted configurations" stub heading either.
  await expect(page.getByText(/Extracted configurations/)).toHaveCount(0);
});
```

- [ ] **Step 3: Run e2e against 240**

Before running, clear allauth rate limit cache + ensure cape-web is on the latest backend (T1 + T2 already deployed):

```bash
sshpass -p cape ssh cape@192.168.2.240 'cd /opt/CAPEv2/web && /etc/poetry/bin/poetry run python manage.py shell -c "from django.core.cache import cache; cache.clear()"'
sshpass -p cape ssh cape@192.168.2.240 'echo cape | sudo -S systemctl restart cape-web'
sleep 4

cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.2.240:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS=admin \
  npx playwright test tests/e2e/settings-tokens-management.spec.mjs --reporter=line --workers=1
```

Expected: 4 passed.

If a test fails:
- Test 2 mask regex `^[a-f0-9]{4}\*{4}[a-f0-9]{4}$` doesn't match → admin's stored token may have changed; check `Token.objects.get(user__username="admin").key` on 240 — must be 40 lowercase hex chars (DRF default).
- Test 3 modal dropdown empty → `?has_token=no` query param not yet active server-side; recheck Task T1 deployment.
- Test 4 still finds the API Tokens heading on `/tokens` → router.tsx not fully updated; recheck Task T2 Step 6.
- Do NOT skip / `.skip` / `.only`.

- [ ] **Step 4: Run full e2e suite — no regressions**

```bash
cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.2.240:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS=admin \
  npx playwright test --reporter=line --workers=1
```

Expected: settings-tokens (4) + users-management (3) + others pass. The pre-existing 3 failures (account-self-service Change-password fragility, 2 task-fixture-dependent specs) are unrelated.

- [ ] **Step 5: Commit + push**

```bash
cd /Users/lamba/github/cape
git add frontend/app/tests/e2e/
git commit -m "test(spa): /settings tokens e2e (replaces tokens-management spec)"
git push origin refactor/web-spa
```

Expected: 3 new commits land on `origin/refactor/web-spa` (T1 + T2 + T3).

---

## Self-Review Notes (controller filled — do not action)

**Spec coverage:**
- Spec §4.1 tokens_list filter revert → Task T1 Step 4
- Spec §4.2 users_list has_token param → Task T1 Step 5
- Spec §4.3 test changes → Task T1 Steps 1-2
- Spec §5.1 file structure → Tasks T2 Steps 1, 3, 4, 5; T3 Steps 1-2
- Spec §5.2 settings.tsx → T2 Step 5
- Spec §5.3 TokenListTable rewrite → T2 Step 3
- Spec §5.4 AddTokenModal → T2 Step 4
- Spec §5.5 users.ts has_token field → T2 Step 2
- Spec §5.6 Sidebar changes → T2 Step 7
- Spec §5.7 router.tsx changes → T2 Step 6
- Spec §6 permissions → already in place (sub-spec #8 T1) — no new work
- Spec §7 audit → already wired via `_handle_token` — no new work
- Spec §8.1 backend tests → T1 Steps 1-2
- Spec §8.2 e2e → T3 Step 2

**Placeholder scan:** clean — every step has explicit code, exact commands, expected output. The "If a test fails" debugging breadcrumbs are advisory, not implementation gaps.

**Type consistency:** `AdminTokenRow` (sub-spec #7 introduced, has `key: string | null`) consumed in T2 Step 3 (`maskToken(row.key)` — guarded by `row.key ?` ternary) and T2 Step 5 (rows passed through). `UserListFilters.has_token: "yes" | "no"` (T2 Step 2) consumed in T2 Step 4 `listUsers({ has_token: "no", limit: 200 })`. `AddTokenModal` props `{onClose, onSuccess: (username, tokenKey) => void}` (T2 Step 4) match call site in `settings.tsx` `<AddTokenModal onClose={...} onSuccess={onAddSuccess} />` (T2 Step 5) — `onAddSuccess` signature `(username: string, tokenKey: string) => void` matches.

**Risk note:** Task T2 deletes `routes/tokens.tsx` and `routes/configs.tsx`. The `router.tsx` lazy imports for them must be deleted in the same commit (T2 Step 6); otherwise Vite build fails. The plan instructs the implementer to do both in T2 to avoid intermediate broken state.
