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
