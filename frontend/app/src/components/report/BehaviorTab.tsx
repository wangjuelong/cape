import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReportBehavior, useReportBehaviorCalls } from "@/hooks/useBehavior";
import type { ApiCall, ProcessSummary } from "@/lib/api/reports";
import { cn } from "@/lib/utils";

import { ProcessTree } from "./ProcessTree";

interface BehaviorTabProps {
  taskId: number;
}

export function BehaviorTab({ taskId }: BehaviorTabProps) {
  const summary = useReportBehavior(taskId);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const processes = summary.data?.processes ?? [];
  const sortedProcesses = useMemo(
    () => [...processes].sort((a, b) => (a.pid ?? 0) - (b.pid ?? 0)),
    [processes],
  );

  // Auto-select the first process when the summary lands.
  const effectivePid =
    selectedPid ??
    (sortedProcesses.length > 0 ? (sortedProcesses[0].pid ?? null) : null);

  if (summary.isLoading) {
    return <Centered><Spinner size={16} /><span className="ml-2">Loading behavior…</span></Centered>;
  }

  if (summary.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No behavior data</AlertTitle>
          <AlertDescription>
            This task has no behavioral analysis recorded yet — likely because it has not finished
            processing, was a static-only or PCAP submission, or ran on a Linux guest with strace
            disabled.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!summary.data || sortedProcesses.length === 0) {
    return <Centered>No processes recorded.</Centered>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex-shrink-0 border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
      >
        <ProcessTree processes={sortedProcesses} selected={effectivePid} onSelect={(pid) => { setSelectedPid(pid); setPage(0); }} />
      </div>
      <div className="flex flex-1 min-h-0">
        <ProcessList
          processes={sortedProcesses}
          selected={effectivePid}
          onSelect={(pid) => { setSelectedPid(pid); setPage(0); }}
        />
        <CallsPanel taskId={taskId} pid={effectivePid} page={page} onPageChange={setPage} />
      </div>
    </div>
  );
}

interface ProcessListProps {
  processes: ProcessSummary[];
  selected: number | null;
  onSelect: (pid: number) => void;
}

function ProcessList({ processes, selected, onSelect }: ProcessListProps) {
  return (
    <aside
      className="flex w-72 shrink-0 flex-col border-r"
      style={{ background: "var(--color-bg-1)", borderColor: "var(--color-border)" }}
    >
      <div
        className="flex h-9 items-center px-3 text-xs font-semibold"
        style={{ color: "var(--color-fg-0)", borderBottom: "1px solid var(--color-border)" }}
      >
        Processes
        <span className="ml-1.5 font-mono" style={{ color: "var(--color-fg-2)" }}>
          · {processes.length}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {processes.map((p) => (
          <button
            key={`${p.pid}-${p.ppid}`}
            type="button"
            onClick={() => p.pid !== null && onSelect(p.pid)}
            className={cn(
              "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left transition-colors",
              selected === p.pid ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-bg-2)]",
            )}
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-xs font-semibold"
                style={{ color: "var(--color-fg-0)" }}
              >
                {p.name || "(unknown)"}
              </div>
              <div className="font-mono text-[10px]" style={{ color: "var(--color-fg-2)" }}>
                pid {p.pid}
                {p.ppid !== null && p.ppid !== undefined ? ` · ppid ${p.ppid}` : ""}
              </div>
            </div>
            <Badge variant="outline">{formatCount(p.calls_count)}</Badge>
          </button>
        ))}
      </div>
    </aside>
  );
}

interface CallsPanelProps {
  taskId: number;
  pid: number | null;
  page: number;
  onPageChange: (page: number) => void;
}

function CallsPanel({ taskId, pid, page, onPageChange }: CallsPanelProps) {
  const calls = useReportBehaviorCalls(taskId, pid, page);

  if (pid === null) {
    return <Centered>Select a process to view its API calls.</Centered>;
  }

  if (calls.isLoading) {
    return <Centered><Spinner size={14} /><span className="ml-2">Loading calls…</span></Centered>;
  }
  if (calls.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Failed to load calls</AlertTitle>
          <AlertDescription>{(calls.error as Error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = calls.data;
  const items = data?.calls ?? [];

  return (
    <main className="flex flex-1 min-w-0 flex-col">
      <div
        className="flex h-9 flex-shrink-0 items-center gap-3 border-b px-3 text-[11px]"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-bg-1)",
          color: "var(--color-fg-2)",
        }}
      >
        <span style={{ color: "var(--color-fg-1)" }}>
          pid <span className="font-mono">{pid}</span>
        </span>
        <span>·</span>
        <span>
          chunk {data ? data.page + 1 : 0} / {data?.total_chunks ?? 0}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.has_next}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <Centered>No calls in this chunk.</Centered>
        ) : (
          <CallsTable calls={items} />
        )}
      </div>
    </main>
  );
}

function CallsTable({ calls }: { calls: ApiCall[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead
        className="sticky top-0 z-10"
        style={{
          background: "var(--color-bg-1)",
          color: "var(--color-fg-2)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <tr>
          <th className="px-3 py-1 text-left">#</th>
          <th className="px-3 py-1 text-left">tid</th>
          <th className="px-3 py-1 text-left">cat</th>
          <th className="px-3 py-1 text-left">api</th>
          <th className="px-3 py-1 text-left">status</th>
          <th className="px-3 py-1 text-left">return</th>
          <th className="px-3 py-1 text-left">arguments</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((c, i) => (
          <tr
            key={c.id ?? i}
            className="border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-2)" }}>
              {c.id ?? i}
            </td>
            <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-2)" }}>
              {c.thread_id ?? ""}
            </td>
            <td className="px-3 py-1">
              {c.category ? <Badge variant="outline">{c.category}</Badge> : null}
            </td>
            <td
              className="px-3 py-1 font-mono font-semibold"
              style={{ color: "var(--color-fg-0)" }}
            >
              {c.api}
            </td>
            <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-2)" }}>
              {c.status ?? ""}
            </td>
            <td
              className="max-w-32 truncate px-3 py-1 font-mono"
              title={String(c.return_value ?? "")}
              style={{ color: "var(--color-fg-2)" }}
            >
              {c.return_value ?? ""}
            </td>
            <td
              className="max-w-md truncate px-3 py-1 font-mono"
              style={{ color: "var(--color-fg-1)" }}
            >
              {formatArgs(c.arguments)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center p-4 text-xs"
      style={{ color: "var(--color-fg-2)" }}
    >
      {children}
    </div>
  );
}

function formatArgs(args: unknown[] | undefined): string {
  if (!args || args.length === 0) return "";
  return args
    .map((a) => {
      if (typeof a !== "object" || a === null) return String(a);
      const o = a as { name?: string; value?: unknown };
      if (o.name !== undefined) {
        return `${o.name}=${truncate(o.value)}`;
      }
      return JSON.stringify(o);
    })
    .join(", ");
}

function truncate(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 40 ? s.slice(0, 37) + "…" : s;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
