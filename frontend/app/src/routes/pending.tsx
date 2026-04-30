import { useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { TaskTable } from "@/components/recent/TaskTable";
import { useTaskList } from "@/hooks/useTaskList";
import { useTaskEvents } from "@/hooks/useTaskEvents";
import type { TaskListFilters, TaskStatus } from "@/types/api";

const ACTIVE_STATUSES: TaskStatus[] = ["pending", "running", "completed"];

export default function PendingRoute() {
  const filters = useMemo<TaskListFilters>(() => ({ status: ACTIVE_STATUSES, limit: 100 }), []);
  const list = useTaskList(filters);
  const { connected } = useTaskEvents();

  const counts = useMemo(() => {
    const c = { pending: 0, running: 0, completed: 0 };
    for (const t of list.tasks) {
      if (t.status in c) {
        c[t.status as keyof typeof c] += 1;
      }
    }
    return c;
  }, [list.tasks]);

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Pending queue"]}
        actions={
          <>
            <LiveIndicator connected={connected} />
            <button type="button" className="btn" onClick={() => list.refetch()}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </>
        }
      />

      <div className="scroll" style={{ padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <StatTile label="Pending" value={counts.pending} color="var(--color-sev-med)" />
          <StatTile label="Running" value={counts.running} color="var(--color-accent)" />
          <StatTile label="Completed" value={counts.completed} color="var(--color-sev-clean)" />
          <StatTile
            label="Total active"
            value={counts.pending + counts.running + counts.completed}
            color="var(--color-fg-0)"
          />
        </div>

        {list.isError && (
          <Alert variant="destructive" style={{ marginBottom: 14 }}>
            <AlertTitle>Failed to load active tasks</AlertTitle>
            <AlertDescription>{(list.error as Error).message}</AlertDescription>
          </Alert>
        )}

        <div className="panel">
          <div className="panel-h">
            Queue <span className="count">· {list.tasks.length} active</span>
            <div className="actions">{list.isFetching && <Spinner size={12} />}</div>
          </div>
          <TaskTable data={list.tasks} />
        </div>
      </div>
    </>
  );
}

interface StatTileProps {
  label: string;
  value: number | string;
  color?: string;
}

function StatTile({ label, value, color }: StatTileProps) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="val" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
