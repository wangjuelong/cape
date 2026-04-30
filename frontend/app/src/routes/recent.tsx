import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Download, RefreshCw, Upload } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { TaskTable } from "@/components/recent/TaskTable";
import { useTaskList } from "@/hooks/useTaskList";
import { useTaskEvents } from "@/hooks/useTaskEvents";
import type { TaskListFilters, TaskStatus, TaskSummary } from "@/types/api";

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

  const setParam = (key: string, value: string | null) => {
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
  const localQuery = (params.get("q") ?? "").trim();
  const filtered = applyLocalFilter(query.tasks, localQuery);

  const statusFilter = params.get("status");
  const categoryFilter = params.get("category");
  const activeChips: Array<{ key: string; label: string }> = [];
  if (statusFilter) activeChips.push({ key: "status", label: `status:${statusFilter}` });
  if (categoryFilter) activeChips.push({ key: "category", label: `category:${categoryFilter}` });
  if (localQuery) activeChips.push({ key: "q", label: `q:${localQuery}` });

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Recent"]}
        actions={
          <>
            <button type="button" className="btn" onClick={() => query.refetch()}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button type="button" className="btn">
              <Download size={14} />
              <span>Export CSV</span>
            </button>
            <a className="btn primary" href="/submit">
              <Upload size={14} />
              <span>New analysis</span>
            </a>
          </>
        }
      />

      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-1)",
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        <span
          className="dim mono"
          style={{ fontSize: 11, marginRight: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          <Filter size={12} style={{ display: "inline-block", marginRight: 4, verticalAlign: -2 }} />
          FILTER:
        </span>
        {activeChips.length === 0 && (
          <span className="dim mono" style={{ fontSize: 11 }}>
            (none)
          </span>
        )}
        {activeChips.map((c) => (
          <button
            key={c.key}
            type="button"
            className="tag accent"
            onClick={() => setParam(c.key, null)}
            title="Click to remove"
            style={{ cursor: "pointer", border: "1px solid rgba(77,212,255,0.25)" }}
          >
            {c.label} <span style={{ marginLeft: 4 }}>×</span>
          </button>
        ))}
        <FilterAddMenu
          label="+ status"
          options={[
            { v: "reported", l: "reported" },
            { v: "running", l: "running" },
            { v: "pending", l: "pending" },
            { v: "completed", l: "completed" },
            { v: "failed_analysis", l: "failed_analysis" },
            { v: "failed_processing", l: "failed_processing" },
            { v: "failed_reporting", l: "failed_reporting" },
          ]}
          active={statusFilter}
          onPick={(v) => setParam("status", v)}
        />
        <FilterAddMenu
          label="+ category"
          options={[
            { v: "file", l: "file" },
            { v: "url", l: "url" },
            { v: "pcap", l: "pcap" },
            { v: "static", l: "static" },
            { v: "archive", l: "archive" },
          ]}
          active={categoryFilter}
          onPick={(v) => setParam("category", v)}
        />
        <input
          type="search"
          className="mono"
          placeholder="filter target / hash"
          value={localQuery}
          onChange={(e) => setParam("q", e.target.value)}
          style={{
            height: 22,
            padding: "0 8px",
            background: "var(--color-bg-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-fg-0)",
            borderRadius: 3,
            fontSize: 11,
            minWidth: 180,
          }}
        />

        <div style={{ flex: 1 }} />
        {query.isFetching && <Spinner size={12} />}
        <span className="dim mono" style={{ fontSize: 11 }}>
          showing {filtered.length} of {query.tasks.length}
          {query.hasNextPage ? " · more available" : ""}
        </span>
        <LiveIndicator connected={connected} />
      </div>

      {query.isError && (
        <div style={{ padding: "12px 14px" }}>
          <Alert variant="destructive">
            <AlertTitle>Failed to load tasks</AlertTitle>
            <AlertDescription>{(query.error as Error).message}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="scroll" style={{ flex: 1 }}>
        <TaskTable data={filtered} />
      </div>

      {query.hasNextPage && (
        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-1)",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--color-fg-2)",
          }}
        >
          <span>{filtered.length} loaded</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn ghost"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
            style={{ height: 22 }}
          >
            {query.isFetchingNextPage ? <Spinner size={12} /> : null}
            Load more →
          </button>
        </div>
      )}
    </>
  );
}

function applyLocalFilter(rows: TaskSummary[], query: string): TaskSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.target.toLowerCase().includes(q) ||
      r.sha256?.toLowerCase().includes(q) ||
      r.sha1?.toLowerCase().includes(q) ||
      r.md5?.toLowerCase().includes(q),
  );
}

interface FilterAddMenuProps {
  label: string;
  options: Array<{ v: string; l: string }>;
  active: string | null;
  onPick: (v: string) => void;
}

function FilterAddMenu({ label, options, active, onPick }: FilterAddMenuProps) {
  return (
    <details style={{ position: "relative" }}>
      <summary
        className="tag"
        style={{ cursor: "pointer", listStyle: "none" }}
        title="Click to add a filter"
      >
        {label}
      </summary>
      <div
        style={{
          position: "absolute",
          top: 22,
          left: 0,
          background: "var(--color-bg-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: 4,
          zIndex: 10,
          minWidth: 140,
          boxShadow: "var(--shadow-1)",
        }}
      >
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onPick(o.v)}
            className="mono"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "4px 8px",
              background: active === o.v ? "var(--color-accent-soft)" : "transparent",
              color: active === o.v ? "var(--color-accent)" : "var(--color-fg-1)",
              border: "none",
              fontSize: 11,
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </details>
  );
}
