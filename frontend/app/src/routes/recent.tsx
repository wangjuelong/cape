import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { TaskTable } from "@/components/recent/TaskTable";
import { useTaskList } from "@/hooks/useTaskList";
import { useTaskEvents } from "@/hooks/useTaskEvents";
import type { TaskListFilters, TaskStatus } from "@/types/api";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Any status" },
  { value: "reported", label: "Reported" },
  { value: "completed", label: "Completed" },
  { value: "running", label: "Running" },
  { value: "pending", label: "Pending" },
  { value: "failed_analysis", label: "Failed (analysis)" },
  { value: "failed_processing", label: "Failed (processing)" },
  { value: "failed_reporting", label: "Failed (reporting)" },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Any category" },
  { value: "file", label: "File" },
  { value: "url", label: "URL" },
  { value: "pcap", label: "PCAP" },
  { value: "static", label: "Static" },
  { value: "archive", label: "Archive" },
];

export default function RecentRoute() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<TaskListFilters>(() => {
    const status = params.get("status");
    const category = params.get("category");
    return {
      status: status && status !== "any" ? (status as TaskStatus) : undefined,
      category: category && category !== "any" ? category : undefined,
      limit: 50,
    };
  }, [params]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "any") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const query = useTaskList(filters);
  const { connected } = useTaskEvents();

  return (
    <>
      <PageHead crumbs={["CAPE", "Recent"]} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex items-end gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
        >
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={params.get("status") ?? "any"}
              onValueChange={(v) => setParam("status", v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={params.get("category") ?? "any"}
              onValueChange={(v) => setParam("category", v)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>Search hash / target</Label>
            <Input
              placeholder="filter result locally — for cross-store search use /search"
              value={params.get("q") ?? ""}
              onChange={(e) => setParam("q", e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {query.isFetching && <Spinner size={12} />}
            <span className="text-[10px]" style={{ color: "var(--color-fg-2)" }}>
              {query.tasks.length} loaded
              {query.hasNextPage ? " · more available" : ""}
            </span>
            <LiveIndicator connected={connected} />
          </div>
        </div>

        {query.isError && (
          <div className="px-4 pt-3">
            <Alert variant="destructive">
              <AlertTitle>Failed to load tasks</AlertTitle>
              <AlertDescription>{(query.error as Error).message}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <TaskTable data={applyLocalFilter(query.tasks, params.get("q") ?? "")} />
        </div>

        {query.hasNextPage && (
          <div
            className="flex items-center justify-center border-t px-4 py-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
          >
            <Button
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              variant="secondary"
            >
              {query.isFetchingNextPage ? <Spinner size={12} /> : null}
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function applyLocalFilter<
  T extends { target: string; sha256: string | null; sha1: string | null; md5: string | null },
>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    return (
      r.target.toLowerCase().includes(q) ||
      r.sha256?.toLowerCase().includes(q) ||
      r.sha1?.toLowerCase().includes(q) ||
      r.md5?.toLowerCase().includes(q)
    );
  });
}
