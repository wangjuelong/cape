import { useMemo } from "react";

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
      <PageHead crumbs={["CAPE", "Pending"]} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex items-center gap-6 border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
        >
          <Stat label="Pending" value={counts.pending} accent="var(--color-fg-1)" />
          <Stat label="Running" value={counts.running} accent="var(--color-sev-low)" />
          <Stat label="Completed" value={counts.completed} accent="var(--color-sev-clean)" />
          <div className="ml-auto flex items-center gap-3">
            {list.isFetching && <Spinner size={12} />}
            <LiveIndicator connected={connected} />
          </div>
        </div>

        {list.isError && (
          <div className="px-4 pt-3">
            <Alert variant="destructive">
              <AlertTitle>Failed to load active tasks</AlertTitle>
              <AlertDescription>{(list.error as Error).message}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <TaskTable data={list.tasks} />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-fg-2)" }}
      >
        {label}
      </span>
      <span className="font-mono text-base font-semibold" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}
