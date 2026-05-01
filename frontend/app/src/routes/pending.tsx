import { useMemo } from "react";
import { RefreshCw, Clock, CheckCircle2 } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { PendingTable } from "@/components/recent/PendingTable";
import { useTaskList } from "@/hooks/useTaskList";
import { useTaskEvents } from "@/hooks/useTaskEvents";
import type { TaskListFilters } from "@/types/api";

/**
 * Pending tasks — mirrors upstream `web/analysis/views.py:pending()` +
 * `templates/analysis/pending.html`. Single card showing only tasks in
 * status=PENDING; columns ID/Timestamp/Category/Target/Hashes/Action.
 *
 * v3 backend serves `/api/v3/tasks/?status=pending`; on failure (vanilla
 * upstream Django without our v3 app) `useTaskList` falls back to
 * scraping `/_upstream/analysis/pending/` HTML.
 */
export default function PendingRoute() {
  const filters = useMemo<TaskListFilters>(
    () => ({ status: ["pending"], limit: 200 }),
    [],
  );
  const list = useTaskList(filters);
  const { connected } = useTaskEvents();

  // After v3 returns a mixed status list, narrow to pending defensively.
  const pending = useMemo(
    () => list.tasks.filter((t) => t.status === "pending"),
    [list.tasks],
  );
  const count = pending.length;

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Pending tasks"]}
        actions={
          <>
            <LiveIndicator connected={connected} />
            <button
              type="button"
              className="btn"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </>
        }
      />

      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ padding: 14 }}>
          <div className="panel">
            {/* Header — matches upstream's card-header layout: title +
                badge (warning bg when count>0, dark when 0). */}
            <div className="panel-h">
              <Clock
                size={14}
                style={{
                  color: "var(--color-sev-med)",
                  marginRight: 6,
                  display: "inline-block",
                  verticalAlign: -2,
                }}
              />
              Pending tasks
              <div className="actions">
                <span
                  className="tag"
                  style={
                    count > 0
                      ? {
                          background: "var(--color-sev-med-bg)",
                          color: "var(--color-sev-med)",
                          borderColor: "rgba(240,179,71,0.3)",
                        }
                      : undefined
                  }
                >
                  {count} pending
                </span>
                {list.isFetching && <Spinner size={12} />}
              </div>
            </div>

            {list.isError && (
              <div style={{ padding: 12 }}>
                <Alert variant="destructive">
                  <AlertTitle>Failed to load pending tasks</AlertTitle>
                  <AlertDescription>{(list.error as Error).message}</AlertDescription>
                </Alert>
              </div>
            )}

            {/* When empty, render upstream's "all caught up" empty state. */}
            {count === 0 && !list.isLoading ? (
              <div
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  color: "var(--color-fg-2)",
                }}
              >
                <CheckCircle2
                  size={44}
                  style={{
                    color: "var(--color-sev-clean)",
                    marginBottom: 10,
                  }}
                />
                <p style={{ margin: 0, fontSize: 14 }}>
                  No pending tasks. You&apos;re all caught up!
                </p>
              </div>
            ) : (
              <PendingTable data={pending} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
