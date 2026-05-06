# `/tokens` Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the `/tokens` admin list to make the API token string the primary visual subject (mono-spaced, masked `abcdef…ef01`, click-to-reveal, click-to-copy), drop the `Generate` row action, drop the `has_token` filter, and fix two display bugs (`className="table"` → `className="data"`; flex on `<td>`).

**Architecture:** Backend `GET /api/v3/tokens/` always filters to users with tokens and returns the full `key` in each row (admin already had this access via `/users/<id>/token/` GET). Frontend `<TokenListTable>` is rewritten to a 4-column layout (`Token | Owner | Created | Actions`) with per-row reveal state managed in a local `useState<Set<number>>`. Copy uses `navigator.clipboard.writeText(fullKey)`.

**Tech Stack:** Django 5 / DRF / drf-spectacular / `rest_framework.authtoken` (host); React 18 / Vite / TanStack Query v5 / radix-ui / Playwright (web); pytest (host tests).

**Spec:** `docs/superpowers/specs/2026-05-06-tokens-redesign-design.md` (commit `f900f94b`)

**Branch:** `refactor/web-spa` (HEAD before this plan: `f900f94b`)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `web/apiv3/serializers.py` | `TokenAdminListItemSerializer` + add `key` field | Modify |
| `web/apiv3/views.py` | `tokens_list` always filters `auth_token__isnull=False`; drop `has_token` query param | Modify |
| `tests/web/test_apiv3_tokens_list.py` | Rebuild test cases around new semantics | Modify (replace 7 tests with 6) |
| `frontend/app/src/lib/api/tokens.ts` | `AdminTokenRow.key`; drop `has_token` from filters | Modify |
| `frontend/app/src/components/tokens/TokenFilterBar.tsx` | Remove has_token select, simplify props | Modify |
| `frontend/app/src/components/tokens/TokenListTable.tsx` | Full rewrite: 4 cols, reveal/copy, owner double-line | Rewrite |
| `frontend/app/src/routes/tokens.tsx` | Drop hasTokenParam state + onGenerate callback | Modify |
| `frontend/app/tests/e2e/tokens-management.spec.mjs` | Rewrite test 3 (filter→reveal+copy) and adjust test 4 (drop Generate step) | Modify |

---

## Task A1: Backend — filter to has_token + add key field + restructure tests

**Files:**
- Modify: `web/apiv3/serializers.py` (extend `TokenAdminListItemSerializer`)
- Modify: `web/apiv3/views.py` (`tokens_list` body)
- Modify: `tests/web/test_apiv3_tokens_list.py` (full rewrite — 6 tests)

**Context for the implementer:** Read `web/apiv3/views.py:716-789` for the existing `tokens_list` implementation (sub-spec #3) and `web/apiv3/serializers.py` end of file for the existing `TokenAdminListItemSerializer`. Reuse the same `_token()` `try/except` helper. The DRF `Token.key` field stores the full 40-char hex string; serializing it costs nothing extra on top of what `select_related("auth_token")` already prefetched.

The pytest fixture pattern (`admin_client`, `_reset_throttle`) is established in `tests/web/test_apiv3_tokens_list.py:1-30` and `tests/web/test_apiv3_token.py:1-30`.

- [ ] **Step 1: Rewrite `tests/web/test_apiv3_tokens_list.py`**

Open the file and replace its contents entirely with:

```python
"""GET /api/v3/tokens/ — admin aggregated list, only users with tokens, includes full key."""
import pytest
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _reset_throttle():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_client():
    a = User.objects.create_user(
        username="adm-tk", email="adm@example.com", password="x", is_staff=True
    )
    Token.objects.create(user=a)
    c = APIClient()
    c.force_authenticate(user=a)
    return c, a


@pytest.mark.django_db
def test_tokens_list_returns_envelope_with_full_key(admin_client):
    c, admin = admin_client
    alice = User.objects.create_user(username="alice", email="alice@example.com")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body and "next_cursor" in body and "total" in body

    by_username = {row["username"]: row for row in body["data"]}
    for username in ("adm-tk", "alice"):
        row = by_username[username]
        assert row["has_token"] is True
        assert row["token_created"] is not None
        # key is the full 40-char hex DRF token, not masked.
        assert isinstance(row["key"], str)
        assert len(row["key"]) == 40
        assert all(ch in "0123456789abcdef" for ch in row["key"])
    # All required columns are present in every row.
    for row in body["data"]:
        for key in (
            "user_id", "username", "email",
            "is_staff", "is_active", "has_token", "token_created", "key",
        ):
            assert key in row


@pytest.mark.django_db
def test_tokens_list_only_returns_users_with_tokens(admin_client):
    c, _admin = admin_client
    User.objects.create_user(username="bob")  # no token
    User.objects.create_user(username="carol")  # no token
    alice = User.objects.create_user(username="alice")
    Token.objects.create(user=alice)

    resp = c.get("/api/v3/tokens/")
    usernames = {row["username"] for row in resp.json()["data"]}
    # Only adm-tk (admin fixture, has token) and alice — bob/carol have no token.
    assert usernames == {"adm-tk", "alice"}


@pytest.mark.django_db
def test_tokens_list_search_matches_username_and_email(admin_client):
    c, _ = admin_client
    alice = User.objects.create_user(username="alice", email="alice@example.com")
    Token.objects.create(user=alice)
    bob = User.objects.create_user(username="bob", email="bob@corp.io")
    Token.objects.create(user=bob)

    resp = c.get("/api/v3/tokens/?search=alice")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "alice" in usernames and "bob" not in usernames

    resp = c.get("/api/v3/tokens/?search=corp.io")
    usernames = {row["username"] for row in resp.json()["data"]}
    assert "bob" in usernames and "alice" not in usernames


@pytest.mark.django_db
def test_tokens_list_cursor_pagination(admin_client):
    c, _ = admin_client
    # admin fixture (id=1, has token) plus 4 more users each with a token.
    for name in ("u1", "u2", "u3", "u4"):
        u = User.objects.create_user(username=name)
        Token.objects.create(user=u)

    page1 = c.get("/api/v3/tokens/?limit=2").json()
    assert len(page1["data"]) == 2
    assert page1["next_cursor"] is not None
    assert page1["total"] == 5

    page2 = c.get(f"/api/v3/tokens/?limit=2&cursor={page1['next_cursor']}").json()
    assert len(page2["data"]) == 2
    page1_ids = {row["user_id"] for row in page1["data"]}
    page2_ids = {row["user_id"] for row in page2["data"]}
    assert page1_ids.isdisjoint(page2_ids)


@pytest.mark.django_db
def test_tokens_list_forbids_non_staff():
    user = User.objects.create_user(username="reg", password="x")
    Token.objects.create(user=user)
    c = APIClient()
    c.force_authenticate(user=user)
    assert c.get("/api/v3/tokens/").status_code == 403


@pytest.mark.django_db
def test_tokens_list_forbids_anonymous():
    assert APIClient().get("/api/v3/tokens/").status_code == 401
```

Note: `test_tokens_list_filter_has_token_yes` and `test_tokens_list_filter_has_token_no` from sub-spec #3 are intentionally **deleted** — the `has_token` query param is being removed from the API contract.

- [ ] **Step 2: Run tests — they MUST fail**

```bash
poetry run python -m pytest tests/web/test_apiv3_tokens_list.py -v
```

Expected: at least 2 failures — the new `test_tokens_list_returns_envelope_with_full_key` (no `key` field yet) and `test_tokens_list_only_returns_users_with_tokens` (current code returns no-token users when no filter).

- [ ] **Step 3: Update `TokenAdminListItemSerializer` in `web/apiv3/serializers.py`**

Find the existing `TokenAdminListItemSerializer` class (it was added by sub-spec #3 at the end of the file). Add a `key` field that delegates through the same `_token()` helper, alongside the existing `has_token` and `token_created` SerializerMethodFields. The final class shape must read:

```python
class TokenAdminListItemSerializer(serializers.Serializer):
    """One row of the admin /tokens/ aggregate list.

    Compatible with both annotated querysets (no `auth_token` relation
    materialised) and bare User instances — uses ``getattr`` fallback so
    the serializer stays usable from view + tests + future contexts.
    """

    user_id = serializers.IntegerField(source="id")
    username = serializers.CharField()
    email = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_active = serializers.BooleanField()
    has_token = serializers.SerializerMethodField()
    token_created = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()

    def _token(self, user):
        # ``auth_token`` is the OneToOne reverse accessor declared on
        # rest_framework.authtoken.models.Token. May raise
        # User.auth_token.RelatedObjectDoesNotExist if no token exists,
        # so guard with try/except — getattr alone won't catch it.
        try:
            return user.auth_token
        except Exception:
            return None

    def get_has_token(self, user) -> bool:
        return self._token(user) is not None

    def get_token_created(self, user):
        tok = self._token(user)
        return tok.created if tok else None

    def get_key(self, user):
        tok = self._token(user)
        return tok.key if tok else None
```

Only the new `key` field + `get_key` method are additions — the rest is verbatim from sub-spec #3.

- [ ] **Step 4: Update `tokens_list` in `web/apiv3/views.py`**

Find the existing `tokens_list` view (sub-spec #3 inserted it before the `# Groups + Permissions list + per-user m2m PATCH` section comment). Replace the entire view body so that:

1. The base queryset filters `auth_token__isnull=False`.
2. The `has_token` query param is no longer parsed.
3. The `OpenApiParameter` for `has_token` is dropped from `extend_schema`.

Final view:

```python
@extend_schema(
    tags=["users"],
    summary="List active API tokens (admin only).",
    description=(
        "One row per user that currently has a DRF API token. Each row "
        "includes the full token `key` so the admin UI can offer reveal "
        "+ copy. Token write operations (Generate / Rotate / Revoke) "
        "live on POST/DELETE /api/v3/users/<id>/token/. Supports "
        "?search= (username/email icontains) + cursor pagination on "
        "user.id."
    ),
    parameters=[
        OpenApiParameter(name="search", type=OpenApiTypes.STR, required=False),
        OpenApiParameter(name="cursor", type=OpenApiTypes.INT, required=False),
        OpenApiParameter(name="limit", type=OpenApiTypes.INT, required=False),
    ],
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def tokens_list(request: Request) -> Response:
    from django.contrib.auth.models import User
    from django.db.models import Q

    qs = (
        User.objects.select_related("auth_token")
        .filter(auth_token__isnull=False)
        .order_by("id")
    )

    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(username__icontains=search) | Q(email__icontains=search)
        )

    total = qs.count()

    cursor = request.query_params.get("cursor")
    if cursor and cursor.isdigit():
        qs = qs.filter(id__gt=int(cursor))

    try:
        limit = int(request.query_params.get("limit") or 50)
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 100))

    rows = list(qs[: limit + 1])
    next_cursor = rows[limit].id if len(rows) > limit else None
    rows = rows[:limit]

    return Response(
        {
            "data": TokenAdminListItemSerializer(rows, many=True).data,
            "next_cursor": next_cursor,
            "total": total,
        }
    )
```

The view's surrounding `# ----- Admin token aggregation` comment block stays; only the `extend_schema` parameters list and the function body change.

- [ ] **Step 5: Run tests — all 6 must pass**

```bash
poetry run python -m pytest tests/web/test_apiv3_tokens_list.py -v
```

Expected: 6 passed.

- [ ] **Step 6: Run the full apiv3 test suite — no regressions**

```bash
poetry run python -m pytest tests/web/test_apiv3_*.py -q
```

Expected: same baseline pass count as before this task. (Pre-existing failures unrelated to /tokens are acceptable; only check that no NEW failures landed.)

- [ ] **Step 7: Commit**

```bash
git add tests/web/test_apiv3_tokens_list.py web/apiv3/serializers.py web/apiv3/views.py
git commit -m "feat(apiv3): /tokens — only return users with tokens + include full key"
```

---

## Task B1: Frontend — types, filter bar, route, table rewrite

**Files:**
- Modify: `frontend/app/src/lib/api/tokens.ts` (`AdminTokenRow`, `AdminTokensListFilters`)
- Modify: `frontend/app/src/components/tokens/TokenFilterBar.tsx` (remove has_token select)
- Rewrite: `frontend/app/src/components/tokens/TokenListTable.tsx`
- Modify: `frontend/app/src/routes/tokens.tsx` (drop hasTokenParam + onGenerate)

**Context for the implementer:** Read these files end-to-end before editing:
- `frontend/app/src/components/tokens/TokenListTable.tsx` (current sub-spec #3 implementation — full rewrite)
- `frontend/app/src/routes/tokens.tsx` (current; many lines reference `hasTokenParam` / `onGenerate` that must go)
- `frontend/app/src/components/users/TokenSection.tsx:84-99` — the established `mono` code-block + Reveal/Copy idiom for token strings; the new TokenListTable adopts the same look-and-feel for inline reveal.
- `frontend/app/src/components/audit/AuditTable.tsx:11-30` — the canonical `className="data"` CSS class used by every other table component (this fixes the sub-spec #3 bug where `className="table"` produced no styling).

The four files change together because the prop contract `<TokenListTable rows onGenerate onRotate onRevoke pendingUserId>` is being replaced with `<TokenListTable rows onRotate onRevoke pendingUserId>`. Splitting the commit would leave intermediate states that fail typecheck.

- [ ] **Step 1: Update `frontend/app/src/lib/api/tokens.ts`**

Find the `AdminTokenRow` interface (added by sub-spec #3) and add a `key` field. Find the `AdminTokensListFilters` interface and remove the `has_token` field. Find `listAdminTokens` and remove the `params.set("has_token", ...)` line. Final shape of the relevant section:

```typescript
export interface AdminTokenRow {
  user_id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  has_token: boolean;
  token_created: string | null;
  key: string | null;
}

export interface AdminTokensListResponse {
  data: AdminTokenRow[];
  next_cursor: number | null;
  total: number;
}

export interface AdminTokensListFilters {
  search?: string;
  cursor?: number;
  limit?: number;
}

export async function listAdminTokens(
  filters: AdminTokensListFilters = {},
): Promise<AdminTokensListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.cursor !== undefined) params.set("cursor", String(filters.cursor));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const { data } = await apiClient.get<AdminTokensListResponse>(
    `/tokens/${qs ? `?${qs}` : ""}`,
  );
  return data;
}
```

The other 6 token client functions (`getMyToken`, `rotateMyToken`, `revokeMyToken`, `getUserToken`, `rotateUserToken`, `revokeUserToken`) are not changed.

- [ ] **Step 2: Simplify `frontend/app/src/components/tokens/TokenFilterBar.tsx`**

Replace the file's entire contents with:

```tsx
import { useState } from "react";

interface Props {
  initialSearch: string;
  onApply: (filters: { search: string }) => void;
}

export function TokenFilterBar({ initialSearch, onApply }: Props) {
  const [search, setSearch] = useState(initialSearch);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ search: search.trim() });
      }}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search username or email…"
        style={{ flex: 1, minWidth: 200 }}
      />
      <button type="submit" className="btn primary">
        Apply
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setSearch("");
          onApply({ search: "" });
        }}
      >
        Clear
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Rewrite `frontend/app/src/components/tokens/TokenListTable.tsx`**

Replace the file's entire contents with:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Eye, EyeOff } from "lucide-react";

import { useToast } from "@/components/shared/Toast";
import type { AdminTokenRow } from "@/lib/api/tokens";

interface Props {
  rows: AdminTokenRow[];
  onRotate: (row: AdminTokenRow) => void;
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}

function maskToken(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function TokenListTable({ rows, onRotate, onRevoke, pendingUserId }: Props) {
  const { showToast } = useToast();
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  if (rows.length === 0) {
    return (
      <div className="dim" style={{ padding: 16 }}>
        No active tokens.
      </div>
    );
  }

  function toggleReveal(userId: number) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      showToast("Token copied to clipboard.", "success");
    } catch {
      showToast("Copy failed — clipboard permission denied.", "error");
    }
  }

  return (
    <table className="data" style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th>Token</th>
          <th style={{ width: 200 }}>Owner</th>
          <th style={{ width: 140 }}>Created</th>
          <th style={{ width: 200 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const busy = pendingUserId === row.user_id;
          const revealed = revealedIds.has(row.user_id);
          const display = row.key ? (revealed ? row.key : maskToken(row.key)) : "—";
          return (
            <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
              <td>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <code
                    className="mono"
                    style={{
                      padding: "3px 6px",
                      background: "var(--color-bg-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 3,
                      wordBreak: "break-all",
                      flex: 1,
                    }}
                  >
                    {display}
                  </code>
                  {row.key && (
                    <button
                      type="button"
                      className="btn ghost"
                      title={revealed ? "Hide" : "Reveal"}
                      onClick={() => toggleReveal(row.user_id)}
                    >
                      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                  {row.key && revealed && (
                    <button
                      type="button"
                      className="btn ghost"
                      title="Copy"
                      onClick={() => copy(row.key!)}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
              </td>
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
              <td className="dim">
                {row.token_created
                  ? new Date(row.token_created).toISOString().slice(0, 10)
                  : "—"}
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => onRotate(row)}
                  >
                    {busy ? "…" : "Rotate"}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => onRevoke(row)}
                  >
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

This rewrite:
- Drops `onGenerate` (Generate moves to `/users/<id>/Tokens` only).
- Reorders columns to `Token | Owner | Created | Actions`.
- Uses `className="data"` (fixes sub-spec #3 bug).
- Wraps the Actions flex layout in a `<div>` inside `<td>` (fixes the flex-on-td bug).
- Imports `Eye`, `EyeOff`, `Copy` from `lucide-react` (already a dep).

- [ ] **Step 4: Update `frontend/app/src/routes/tokens.tsx`**

Three concrete edits in this file:

a) Drop the `hasTokenParam` derivation. Find:

```tsx
  const search = searchParams.get("search") ?? "";
  const hasTokenParam = (searchParams.get("has_token") ?? "all") as "all" | "yes" | "no";

  const filters = useMemo(
    () => ({ search, has_token: hasTokenParam, limit: 50 }),
    [search, hasTokenParam],
  );
```

Replace with:

```tsx
  const search = searchParams.get("search") ?? "";

  const filters = useMemo(
    () => ({ search, limit: 50 }),
    [search],
  );
```

b) Drop the `onGenerate` callback entirely. Find and DELETE this whole block:

```tsx
  function onGenerate(row: AdminTokenRow) {
    if (pendingUserId !== null) return;
    if (!window.confirm(`Generate API token for ${row.username}?`)) return;
    rotateM.mutate(row.user_id);
  }
```

c) Update `applyFilters` to no longer accept / set `has_token`. Find:

```tsx
  function applyFilters(next: { search: string; has_token: "all" | "yes" | "no" }) {
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    if (next.has_token !== "all") params.set("has_token", next.has_token);
    setSearchParams(params, { replace: true });
  }
```

Replace with:

```tsx
  function applyFilters(next: { search: string }) {
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    setSearchParams(params, { replace: true });
  }
```

d) Update the `<TokenFilterBar>` JSX call site:

```tsx
            <TokenFilterBar
              initialSearch={search}
              initialHasToken={hasTokenParam}
              onApply={applyFilters}
            />
```

Replace with:

```tsx
            <TokenFilterBar initialSearch={search} onApply={applyFilters} />
```

e) Update the `<TokenListTable>` JSX call site:

```tsx
              <TokenListTable
                rows={rows}
                onGenerate={onGenerate}
                onRotate={onRotate}
                onRevoke={onRevoke}
                pendingUserId={pendingUserId}
              />
```

Replace with:

```tsx
              <TokenListTable
                rows={rows}
                onRotate={onRotate}
                onRevoke={onRevoke}
                pendingUserId={pendingUserId}
              />
```

The `TokenRevealDialog` (rotate-success modal) stays and still works the same — it's independent of the new inline reveal.

- [ ] **Step 5: Typecheck + build**

```bash
cd /Users/lamba/github/cape/frontend/app && npm run typecheck && npm run build 2>&1 | tail -3
```

Expected: typecheck clean, `built in <Ns>`.

If typecheck fails:
- "Cannot find name 'hasTokenParam'" → still referenced somewhere in `tokens.tsx` (left-over after delete).
- "Property 'has_token' does not exist on type 'AdminTokensListFilters'" → check Step 1 actually removed it.
- "Property 'onGenerate' is missing in type" / "Property 'onGenerate' does not exist" → `<TokenListTable>` call site / type definition out of sync. Re-read Step 3 + 4.

- [ ] **Step 6: Deploy + smoke**

```bash
cd /Users/lamba/github/cape
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S chown -R ubuntu:ubuntu /opt/CAPEv2/web/static/spa'
sshpass -p ubuntu rsync -a --delete -e "ssh -o StrictHostKeyChecking=no" frontend/app/dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web/static/spa && echo ubuntu | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "/tokens → %{http_code}\n" http://192.168.1.6:8000/tokens
```

Expected: `/tokens → 302` (anonymous redirect to login).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/src/lib/api/tokens.ts frontend/app/src/components/tokens/TokenFilterBar.tsx frontend/app/src/components/tokens/TokenListTable.tsx frontend/app/src/routes/tokens.tsx
git commit -m "feat(spa): /tokens redesign — Token-as-primary, reveal/copy, drop Generate"
```

---

## Task C1: e2e rewrite + push

**Files:**
- Modify: `frontend/app/tests/e2e/tokens-management.spec.mjs` (replace 2 of 4 tests)

**Context for the implementer:** Read the current `frontend/app/tests/e2e/tokens-management.spec.mjs` (110 lines). Tests 1 and 2 stay roughly the same. Test 3 (`filter has_token=no syncs URL`) must be replaced — that filter no longer exists. Test 4 (`generate → reveal modal → revoke round-trip on temp user`) must be adapted: the temp user's row only appears AFTER generating their token from `/users/<id>/Tokens`, since `/tokens` no longer shows users without tokens.

The login helper, env-var conventions (`PARITY_SPA_URL` / `SPA_LOGIN_USER` / `SPA_LOGIN_PASS`, default `cape123!`), and `test.describe.configure({ mode: "serial" })` are unchanged.

- [ ] **Step 1: Replace `frontend/app/tests/e2e/tokens-management.spec.mjs`**

Replace the file's entire contents with:

```javascript
/**
 * /tokens admin top-level page (sub-spec #7 redesign):
 * 1 row = 1 active token; Token column is the primary subject with
 * mask + reveal + copy. Generate has moved to /users/<id>/Tokens —
 * test 4 generates the temp user's token from there before asserting
 * its row appears in /tokens.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

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

test("Sidebar Admin > Tokens link visible to staff", async ({ page }) => {
  await login(page);
  const link = page.getByRole("link", { name: /^Tokens$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/tokens");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${SPA}/tokens(\\?.*)?$`));
});

test("/tokens list renders heading + admin row with masked token", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  // Panel heading "Tokens (N)" rendered as h2.
  await expect(page.getByRole("heading", { name: /Tokens/ }).first()).toBeVisible();
  // Admin row present (admin has a token from the historical e2e setup).
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  // Token cell shows the GitHub-style mask 6 chars + … + 4 chars.
  await expect(adminRow.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
});

test("row reveals full token then masks again, copy button works", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  const code = adminRow.locator("code").first();
  // Initially masked.
  await expect(code).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
  // Click the Reveal button (titled "Reveal" before reveal, "Hide" after).
  await adminRow.getByRole("button", { name: "Reveal" }).click();
  // Now full 40-char hex.
  await expect(code).toHaveText(/^[a-f0-9]{40}$/);
  // Copy button is now visible — clicking it must not throw.
  await adminRow.getByRole("button", { name: "Copy" }).click();
  // Toggle back to mask.
  await adminRow.getByRole("button", { name: "Hide" }).click();
  await expect(code).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
});

test("temp user appears after token generation, then rotate + revoke removes it", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new.
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. Generate token from the user-detail Tokens tab (Generate is no
  //    longer on the /tokens page).
  await page.getByRole("button", { name: "API Token" }).click();
  await page.getByRole("button", { name: /^Generate token$/ }).click();
  // Inline reveal in the per-user TokenSection — wait for the mono code
  // block to populate with a 40-hex key.
  await expect(
    page.locator("code.mono").filter({ hasText: /^[a-f0-9]{30,}$/ }).first(),
  ).toBeVisible({ timeout: 8000 });

  // 3. /tokens now lists the temp user.
  await page.goto(`${SPA}/tokens?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible();
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);

  // 4. Rotate. window.confirm() comes first — accept it.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Rotate$/ }).click();
  // Reveal dialog appears with new full key.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog.locator("code")).toHaveText(/^[a-f0-9]{30,}$/);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 5. Revoke — row should disappear from /tokens (no token = not listed).
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row).toBeHidden({ timeout: 8000 });

  // 6. Cleanup: delete the temp user via /users list.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});
```

Behavioural changes vs sub-spec #3 e2e:
- Test 2 now asserts the masked-format regex `[a-f0-9]{6}…[a-f0-9]{4}` instead of the old "Active" badge.
- Test 3 is brand new — exercises reveal / copy / hide.
- Test 4 generates the temp user's token from `/users/<id>/Tokens` (Generate is gone from `/tokens`); the post-revoke assertion is now "row disappears" instead of "row reverts to no-token state".

- [ ] **Step 2: Run the e2e suite against the live SPA**

```bash
cd /Users/lamba/github/cape/frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 SPA_LOGIN_USER=admin SPA_LOGIN_PASS=cape123! \
  npx playwright test tests/e2e/tokens-management.spec.mjs --reporter=line
```

Expected: 4/4 pass.

If any test fails:
- Test 2 mask regex fails → check that admin's stored token actually returns from the new endpoint with `key`. Run on the remote box: `sshpass -p ubuntu ssh ubuntu@192.168.1.6 'cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py shell -c "from rest_framework.authtoken.models import Token; print(Token.objects.filter(user__username=\"admin\").first().key)"'` — should print 40 hex chars.
- Test 3 reveal toggle fails → confirm the deployed bundle includes the new `TokenListTable` (re-run Task B1 Step 6 deploy block).
- Test 4 "Generate token" button not found → the user-detail Tokens tab uses `TokenSection.tsx`; the Generate button label is `Generate token` (verify with `grep -n "Generate token" frontend/app/src/components/users/TokenSection.tsx`).
- Do NOT skip / `.skip` / `.only` any test.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/lamba/github/cape
git add frontend/app/tests/e2e/tokens-management.spec.mjs
git commit -m "test(spa): /tokens redesign e2e — mask/reveal/copy + Generate moved to user detail"
git push origin refactor/web-spa
```

Expected: 3 new commits land on `origin/refactor/web-spa` (A1 + B1 + C1).

---

## Self-Review Notes (controller filled — do not action)

**Spec coverage:**
- Spec §4.1 endpoint changes (filter to has_token, drop has_token query, add `key`) → Task A1 Step 4
- Spec §4.2 serializer adds `key` SerializerMethodField → Task A1 Step 3
- Spec §5.1 file clean-list (4 modify + 1 e2e) → Tasks B1 + C1
- Spec §5.2 new TokenListTable layout (4 columns, mask/reveal/copy, owner double line) → Task B1 Step 3
- Spec §5.3 bug fixes (`className="data"`, flex on td via inner div) → embedded in Task B1 Step 3 rewrite
- Spec §5.4 simplified TokenFilterBar → Task B1 Step 2
- Spec §5.5 routes/tokens.tsx simplification → Task B1 Step 4
- Spec §5.6 type changes → Task B1 Step 1
- Spec §6 permissions (unchanged) → not in plan (no work needed)
- Spec §7 audit (unchanged, reuses existing ACTIONs) → not in plan
- Spec §8.1 backend pytest restructure → Task A1 Step 1
- Spec §8.2 frontend e2e rewrite → Task C1 Step 1

**Placeholder scan:** clean — every step has explicit code, exact commands, expected output.

**Type consistency:** `AdminTokenRow.key: string | null` (B1 Step 1) flows into `TokenListTable` props (B1 Step 3 — uses `row.key`). `AdminTokensListFilters` no longer has `has_token` (B1 Step 1) — every consumer (B1 Step 2 FilterBar, B1 Step 4 route, useAdminTokensInfinite hook) already accepts `Omit<AdminTokensListFilters, "cursor">` so they pick up the deletion automatically. `<TokenListTable>` prop signature changes from `{rows, onGenerate, onRotate, onRevoke, pendingUserId}` to `{rows, onRotate, onRevoke, pendingUserId}` consistently in B1 Step 3 (definition) and B1 Step 4 (call site). `TokenRevealDialog` is unchanged — confirmed by reading the file (sub-spec #3); the rotate-success modal flow is independent of inline reveal.

**Note on `useAdminTokensInfinite` hook:** the hook's signature `Omit<AdminTokensListFilters, "cursor">` (defined in `frontend/app/src/hooks/useTokensAdmin.ts`) automatically narrows once the `has_token` field is removed from `AdminTokensListFilters` in B1 Step 1 — no explicit hook change needed.
