import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { UserFilterBar } from "@/components/users/UserFilterBar";
import { UserListTable } from "@/components/users/UserListTable";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUsersInfinite } from "@/hooks/useUsers";
import type { UserListFilters } from "@/lib/api/users";

function filtersFromSearch(sp: URLSearchParams): UserListFilters {
  const f: UserListFilters = {};
  const s = sp.get("search");
  if (s) f.search = s;
  const ist = sp.get("is_staff");
  if (ist) f.is_staff = ist === "true";
  const isa = sp.get("is_active");
  if (isa) f.is_active = isa === "true";
  const g = sp.get("group");
  if (g) f.group = g;
  const o = sp.get("ordering");
  if (o) f.ordering = o;
  return f;
}

function searchFromFilters(f: UserListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("search", f.search);
  if (f.is_staff !== undefined) sp.set("is_staff", String(f.is_staff));
  if (f.is_active !== undefined) sp.set("is_active", String(f.is_active));
  if (f.group) sp.set("group", f.group);
  if (f.ordering) sp.set("ordering", f.ordering);
  return sp;
}

export default function UsersRoute() {
  const me = useCurrentUser();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const q = useUsersInfinite(filters);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (me.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span style={{ marginLeft: 8 }}>Loading…</span>
      </Centered>
    );
  }
  if (!me.data?.is_staff) {
    return (
      <>
        <PageHead crumbs={["CAPE", "Admin", "Users"]} />
        <div style={{ padding: 14 }}>
          <Alert variant="destructive">
            <AlertTitle>Admin privileges required</AlertTitle>
            <AlertDescription>
              The /users page is restricted to <code className="mono">is_staff = true</code>{" "}
              accounts.
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Admin", "Users"]}
        actions={
          <Link
            to="/users/new"
            className="btn primary"
            style={{ height: 28, padding: "0 12px", fontSize: 12 }}
          >
            + Add user
          </Link>
        }
      />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div className="panel-h">
            Users{" "}
            <span className="count">
              · {rows.length} loaded / {total} total
            </span>
          </div>
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            <UserFilterBar
              initial={filters}
              onApply={(next) => {
                setSp(searchFromFilters(next));
                setSelected(new Set());
              }}
            />
            {q.isLoading ? (
              <Centered>
                <Spinner size={14} />
                <span style={{ marginLeft: 8 }}>Loading users…</span>
              </Centered>
            ) : (
              <UserListTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
            )}
            {q.hasNextPage && (
              <button
                type="button"
                className="btn"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                style={{ alignSelf: "flex-start" }}
              >
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        fontSize: 12,
        color: "var(--color-fg-2)",
      }}
    >
      {children}
    </div>
  );
}
