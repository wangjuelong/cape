import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuditFilterBar } from "@/components/audit/AuditFilterBar";
import { AuditTable } from "@/components/audit/AuditTable";
import { useAuditActions } from "@/hooks/useAuditActions";
import { useAuditEvents } from "@/hooks/useAuditEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { AuditFilters } from "@/lib/api/audits";

export default function AuditRoute() {
  const me = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();

  // Convert URL state to AuditFilters
  const filters = useMemo<AuditFilters>(() => {
    const f: AuditFilters = {};
    const get = (k: string) => searchParams.get(k) || undefined;
    f.actor = get("actor");
    f.action = get("action");
    f.target_user = get("target_user");
    f.target_type = get("target_type");
    f.since = get("since");
    f.until = get("until");
    f.q = get("q");
    const succ = get("success");
    if (succ === "true") f.success = true;
    else if (succ === "false") f.success = false;
    return f;
  }, [searchParams]);

  const actionsQuery = useAuditActions();
  const eventsQuery = useAuditEvents(filters);

  // -- Auth gate --
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
        <PageHead crumbs={["CAPE", "Admin", "Audit"]} />
        <div style={{ padding: 14 }}>
          <Alert variant="destructive">
            <AlertTitle>Admin privileges required</AlertTitle>
            <AlertDescription>
              The audit log contains sensitive identity / access data and is restricted to accounts
              with <code className="mono">is_staff = true</code>. Sign in with an admin account to
              continue.
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  // -- Data states --
  const events = (eventsQuery.data?.pages ?? []).flatMap((p) => p.data);
  const catalog = actionsQuery.data?.data ?? [];

  function applyFilters(next: AuditFilters) {
    const params = new URLSearchParams();
    if (next.actor) params.set("actor", next.actor);
    if (next.action) {
      const a = Array.isArray(next.action) ? next.action.join(",") : next.action;
      params.set("action", a);
    }
    if (next.target_user) params.set("target_user", next.target_user);
    if (next.since) params.set("since", next.since);
    if (next.until) params.set("until", next.until);
    if (next.success !== undefined) params.set("success", String(next.success));
    setSearchParams(params, { replace: true });
  }

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Admin", "Audit"]}
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        }
      />
      <div className="scroll" style={{ padding: 14 }}>
        <AuditFilterBar initial={filters} catalog={catalog} onApply={applyFilters} />

        {eventsQuery.isError && (
          <Alert variant="destructive" style={{ marginBottom: 14 }}>
            <AlertTitle>Could not load audit events</AlertTitle>
            <AlertDescription>{(eventsQuery.error as Error).message}</AlertDescription>
          </Alert>
        )}

        {eventsQuery.isLoading ? (
          <Centered>
            <Spinner size={14} />
            <span style={{ marginLeft: 8 }}>Loading audit events…</span>
          </Centered>
        ) : events.length === 0 ? (
          <Centered>
            <span className="dim">
              {Object.values(filters).some(Boolean)
                ? "No events match these filters."
                : "No audit events recorded yet."}
            </span>
          </Centered>
        ) : (
          <>
            <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>
              {events.length} event{events.length === 1 ? "" : "s"} loaded
            </div>
            <AuditTable events={events} catalog={catalog} />
            {eventsQuery.hasNextPage && (
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => eventsQuery.fetchNextPage()}
                  disabled={eventsQuery.isFetchingNextPage}
                >
                  {eventsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
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
