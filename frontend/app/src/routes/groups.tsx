import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BulkDeleteBar } from "@/components/groups/BulkDeleteBar";
import { GroupFilterBar } from "@/components/groups/GroupFilterBar";
import { GroupListTable } from "@/components/groups/GroupListTable";
import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useGroupsInfinite } from "@/hooks/useGroups";
import type { GroupListFilters } from "@/lib/api/groups";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 32 }}>
      {children}
    </div>
  );
}

function filtersFromSearch(sp: URLSearchParams): GroupListFilters {
  const f: GroupListFilters = {};
  const s = sp.get("search");
  if (s) f.search = s;
  return f;
}

function searchFromFilters(f: GroupListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("search", f.search);
  return sp;
}

export default function GroupsRoute() {
  const me = useCurrentUser();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(sp), [sp]);
  const q = useGroupsInfinite(filters);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (me.isLoading) return <Centered><Spinner size={14} /></Centered>;
  if (!me.data?.is_staff) {
    return (
      <Centered>
        <Alert variant="destructive">
          <AlertTitle>Admin privileges required</AlertTitle>
          <AlertDescription>
            The /groups page is restricted to is_staff accounts.
          </AlertDescription>
        </Alert>
      </Centered>
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
        crumbs={["CAPE", "Admin", "Groups"]}
        actions={
          <Link
            to="/groups/new"
            className="btn primary"
            style={{ height: 28, padding: "0 12px", fontSize: 12 }}
          >
            + New group
          </Link>
        }
      />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <h2 className="panel-h" style={{ margin: 0 }}>
            Groups <span className="count">· {rows.length} loaded / {total} total</span>
          </h2>
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            <GroupFilterBar
              initial={filters}
              onApply={(next) => {
                setSp(searchFromFilters(next));
                setSelected(new Set());
              }}
            />
            <BulkDeleteBar
              selected={selected}
              names={new Map(rows.map((r) => [r.id, r.name]))}
              onClear={() => setSelected(new Set())}
            />
            {q.isLoading ? (
              <Centered><Spinner size={14} /></Centered>
            ) : (
              <GroupListTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
            )}
            {q.hasNextPage && (
              <button
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
