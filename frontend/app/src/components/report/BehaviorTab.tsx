/**
 * Behavior tab — 1:1 functional replica of upstream
 * `web/templates/analysis/behavior/{index,_processes,_chunk,_api_call}.html`.
 *
 * Layout (top → bottom):
 *   1. Process Tree card (recursive)
 *   2. Process pills card (Search + one pill per process)
 *   3. Per-process pane:
 *      - Process info banner (PID / Parent PID / Path / Cmd / Image Base /
 *        Size / Bitness / Dll Base)
 *      - 12 category filter buttons (Default / Registry / Filesystem / Network /
 *        Process / Threading / Services / Sync / Crypto / Browser / Device / All)
 *      - Inline API filter input "CreateFile, !CloseHandle"
 *      - Advanced filters collapse (Caller + Thread ID)
 *      - Top + Bottom pagination
 *      - Calls table 8 cols: Time / TID / Caller / API / Arguments / Status /
 *        Return / Repeated
 *
 * Backend interface unchanged — all data flows through the existing
 * /api/v3/reports/<id>/behavior/* endpoints (the calls endpoint accepts new
 * optional `category / apifilter / caller / tid` query params; pre-existing
 * callers without filters keep working).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import {
  useReportBehavior,
  useReportBehaviorCalls,
  useReportBehaviorSearch,
} from "@/hooks/useBehavior";
import type {
  ApiCall,
  ApiCallArgument,
  BehaviorCallFilters,
  ProcessSummary,
} from "@/lib/api/reports";

import { ProcessTreeIndented } from "./ProcessTreeIndented";

interface BehaviorTabProps {
  taskId: number;
}

type TabKey = "search" | `process:${number}`;

// Category buttons — first row is "Default" (no filter), last is "All" (also no filter).
const CATEGORY_BUTTONS: Array<{ key: string; label: string; cssClass: string }> = [
  { key: "default", label: "Default", cssClass: "btn-cat-default" },
  { key: "registry", label: "Registry", cssClass: "btn-cat-registry" },
  { key: "filesystem", label: "Filesystem", cssClass: "btn-cat-filesystem" },
  { key: "network", label: "Network", cssClass: "btn-cat-network" },
  { key: "process", label: "Process", cssClass: "btn-cat-process" },
  { key: "threading", label: "Threading", cssClass: "btn-cat-threading" },
  { key: "services", label: "Services", cssClass: "btn-cat-services" },
  { key: "sync", label: "Sync", cssClass: "btn-cat-synchronization" },
  { key: "crypto", label: "Crypto", cssClass: "btn-cat-crypto" },
  { key: "browser", label: "Browser", cssClass: "btn-cat-browser" },
  { key: "device", label: "Device", cssClass: "btn-cat-device" },
  { key: "all", label: "All", cssClass: "btn-cat-all" },
];

export function BehaviorTab({ taskId }: BehaviorTabProps) {
  const summary = useReportBehavior(taskId);
  const processes = summary.data?.processes ?? [];
  const sortedProcesses = useMemo(
    () => [...processes].sort((a, b) => (a.pid ?? 0) - (b.pid ?? 0)),
    [processes],
  );
  const detections2pid = summary.data?.detections2pid ?? {};

  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  // Auto-select first process pill when summary lands.
  useEffect(() => {
    if (activeTab) return;
    if (sortedProcesses.length > 0 && sortedProcesses[0].pid !== null) {
      setActiveTab(`process:${sortedProcesses[0].pid}`);
    }
  }, [sortedProcesses, activeTab]);

  if (summary.isLoading) {
    return (
      <Centered>
        <Spinner size={16} />
        <span style={{ marginLeft: 8 }}>Loading behavior…</span>
      </Centered>
    );
  }

  if (summary.isError || !summary.data || sortedProcesses.length === 0) {
    return (
      <div style={{ padding: 14 }}>
        <div className="panel">
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-fg-2)" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>ⓘ</div>
            <div>No behavioral analysis data available.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll" style={{ padding: 14 }}>
      <ProcessTreeCard
        processtree={summary.data.processtree}
        detections2pid={detections2pid}
        onJumpToPid={(pid) => setActiveTab(`process:${pid}`)}
      />

      <div className="panel" style={{ marginBottom: 14 }}>
        <div
          className="panel-h"
          style={{
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "6px 12px",
          }}
        >
          <PillButton
            active={activeTab === "search"}
            onClick={() => setActiveTab("search")}
            label="🔎 Search"
          />
          {sortedProcesses.map((p) => (
            <PillButton
              key={p.pid ?? p.name}
              active={activeTab === `process:${p.pid}`}
              onClick={() => p.pid !== null && setActiveTab(`process:${p.pid}`)}
              label={`▸ ${p.name || "(unknown)"} (${p.pid})`}
            />
          ))}
        </div>

        <div style={{ padding: 14 }}>
          {activeTab === "search" && <SearchPane taskId={taskId} />}
          {activeTab && activeTab !== "search" && (
            <ProcessPane
              taskId={taskId}
              process={
                sortedProcesses.find((p) => `process:${p.pid}` === activeTab) ?? sortedProcesses[0]
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process Tree card
// ---------------------------------------------------------------------------

interface ProcessTreeCardProps {
  processtree: unknown[];
  detections2pid: Record<string, string[]>;
  onJumpToPid: (pid: number) => void;
}

function ProcessTreeCard({ processtree, detections2pid, onJumpToPid }: ProcessTreeCardProps) {
  if (!processtree || processtree.length === 0) {
    return null;
  }
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">Process Tree</div>
      <div style={{ padding: 14 }}>
        <ProcessTreeIndented
          tree={processtree}
          detections2pid={detections2pid}
          onSelect={onJumpToPid}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process pane (info banner + filters + calls table + pagination)
// ---------------------------------------------------------------------------

interface ProcessPaneProps {
  taskId: number;
  process: ProcessSummary;
}

function ProcessPane({ taskId, process }: ProcessPaneProps) {
  const pid = process.pid as number;
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<BehaviorCallFilters>({});
  const [activeCat, setActiveCat] = useState<string>("default");
  const [apifilter, setApifilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [callerFilter, setCallerFilter] = useState("");
  const [tidFilter, setTidFilter] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  // Reset to first page when pid changes
  useEffect(() => {
    setPage(0);
    setFilters({});
    setActiveCat("default");
    setApifilter("");
    setCallerFilter("");
    setTidFilter("");
  }, [pid]);

  const calls = useReportBehaviorCalls(taskId, pid, page, filters);

  const applyCategory = (cat: string) => {
    setActiveCat(cat);
    setPage(0);
    if (cat === "default" || cat === "all") {
      setFilters({});
    } else {
      setFilters({ category: cat });
    }
  };

  const applyApiFilter = () => {
    const trimmed = apifilter.trim();
    setActiveCat("all");
    setPage(0);
    setFilters(trimmed ? { apifilter: trimmed } : {});
  };

  const applyAdvanced = () => {
    const f: BehaviorCallFilters = {};
    if (callerFilter.trim()) f.caller = callerFilter.trim();
    if (tidFilter.trim()) f.tid = tidFilter.trim();
    if (apifilter.trim()) f.apifilter = apifilter.trim();
    setActiveCat("all");
    setPage(0);
    setFilters(f);
  };

  return (
    <div ref={topRef}>
      <ProcessInfoBanner process={process} />

      <CategoryButtons active={activeCat} onSelect={applyCategory} />

      <div
        style={{
          display: "flex",
          gap: 6,
          maxWidth: 520,
          margin: "0 auto 12px auto",
        }}
      >
        <input
          type="text"
          className="input"
          style={{ flex: 1, fontSize: 11.5 }}
          placeholder="Filter API calls (e.g. 'CreateFile, !CloseHandle')"
          value={apifilter}
          onChange={(e) => setApifilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyApiFilter();
          }}
        />
        <button type="button" className="btn" onClick={applyApiFilter}>
          🔎 Apply
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <button
          type="button"
          className="btn ghost"
          style={{ fontSize: 11 }}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          Advanced Filters {showAdvanced ? "▾" : "▸"}
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            background: "var(--color-bg-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: 12,
            marginBottom: 14,
            display: "flex",
            gap: 8,
          }}
        >
          <input
            type="text"
            className="input"
            style={{ flex: 1, fontSize: 11.5 }}
            placeholder="Caller"
            value={callerFilter}
            onChange={(e) => setCallerFilter(e.target.value)}
          />
          <input
            type="text"
            className="input"
            style={{ flex: 1, fontSize: 11.5 }}
            placeholder="Thread ID"
            value={tidFilter}
            onChange={(e) => setTidFilter(e.target.value)}
          />
          <button type="button" className="btn" onClick={applyAdvanced}>
            Filter
          </button>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={calls.data?.total_chunks ?? 0}
        onChange={(p) => {
          setPage(p);
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <div style={{ marginTop: 8 }}>
        {calls.isLoading ? (
          <Centered>
            <Spinner size={14} />
            <span style={{ marginLeft: 8 }}>Loading calls…</span>
          </Centered>
        ) : (calls.data?.calls.length ?? 0) === 0 ? (
          <Centered>
            <span style={{ opacity: 0.6 }}>No matching API calls.</span>
          </Centered>
        ) : (
          <CallsTable calls={calls.data!.calls} />
        )}
      </div>

      <Pagination
        page={page}
        totalPages={calls.data?.total_chunks ?? 0}
        onChange={(p) => {
          setPage(p);
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process info banner
// ---------------------------------------------------------------------------

function ProcessInfoBanner({ process }: { process: ProcessSummary }) {
  const env = process.environ ?? {};
  const imgBase = env.MainExeBase || process.image_base || "";
  const size = env.MainExeSize || process.size || "";
  const bitness = env.Bitness || process.bitness || "";
  const cmdline = env.CommandLine || "";
  const dllBase = env.DllBase || "";

  return (
    <div
      style={{
        background: "rgba(13, 110, 253, 0.08)",
        border: "1px solid rgba(13, 110, 253, 0.4)",
        color: "var(--color-fg-1)",
        padding: 14,
        borderRadius: 4,
        marginBottom: 14,
        textAlign: "center",
        lineHeight: 1.7,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--color-fg-0)",
          marginBottom: 6,
        }}
      >
        {process.name}
      </div>
      <div style={{ fontSize: 11.5 }}>
        PID: <strong>{process.pid}</strong> | Parent PID: <strong>{process.ppid ?? "—"}</strong>
        {process.module_path && (
          <>
            <br />
            Path: <code style={{ color: "var(--color-fg-0)" }}>{process.module_path}</code>
          </>
        )}
        {cmdline && (
          <>
            <br />
            Cmd: <code style={{ color: "var(--color-fg-0)" }}>{cmdline}</code>
          </>
        )}
        <br />
        {imgBase && (
          <>
            Image Base: <strong>{imgBase}</strong>
          </>
        )}
        {size && (
          <>
            {imgBase ? " | " : ""}Size: <strong>{size}</strong>
          </>
        )}
        {bitness && (
          <>
            {imgBase || size ? " | " : ""}Bitness: <strong>{bitness}</strong>
          </>
        )}
        {dllBase && (
          <>
            <br />
            Dll Image Base: <strong>{dllBase}</strong>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category filter buttons
// ---------------------------------------------------------------------------

function CategoryButtons({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (cat: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        justifyContent: "center",
        marginBottom: 12,
      }}
    >
      {CATEGORY_BUTTONS.map((b) => (
        <button
          key={b.key}
          type="button"
          className={`btn ${b.cssClass}`}
          data-active={active === b.key ? "true" : "false"}
          onClick={() => onSelect(b.key)}
          style={{
            fontSize: 11,
            padding: "4px 10px",
            opacity: active === b.key ? 1 : 0.62,
            fontWeight: active === b.key ? 700 : 400,
            border:
              active === b.key ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  // Upstream layout: 1 ... (current ± 5) ... last
  const items: Array<number | "..."> = [];
  const cur = page; // 0-based internally
  items.push(0);
  if (cur - 5 > 1) items.push("...");
  for (let i = Math.max(1, cur - 5); i <= Math.min(totalPages - 2, cur + 5); i++) {
    items.push(i);
  }
  if (cur + 5 < totalPages - 2) items.push("...");
  if (totalPages > 1) items.push(totalPages - 1);

  // De-dup adjacent indexes
  const dedup: typeof items = [];
  for (const it of items) {
    if (dedup.length === 0 || dedup[dedup.length - 1] !== it) dedup.push(it);
  }

  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        justifyContent: "center",
        flexWrap: "wrap",
        margin: "8px 0",
      }}
    >
      {dedup.map((it, idx) =>
        it === "..." ? (
          <span key={`ell-${idx}`} className="dim" style={{ padding: "4px 10px", fontSize: 11 }}>
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            className="btn"
            onClick={() => onChange(it)}
            style={{
              fontSize: 11,
              padding: "3px 9px",
              fontWeight: it === cur ? 700 : 400,
              opacity: it === cur ? 1 : 0.7,
              border:
                it === cur ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
            }}
          >
            {it + 1}
          </button>
        ),
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Calls table — 8 cols matching upstream
// ---------------------------------------------------------------------------

function CallsTable({ calls }: { calls: ApiCall[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data" style={{ width: "100%", fontSize: 11, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "37%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "6%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Time</th>
            <th>TID</th>
            <th>Caller</th>
            <th>API</th>
            <th>Arguments</th>
            <th>Status</th>
            <th>Return</th>
            <th>Repeated</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => (
            <CallRow key={c.id ?? `c-${i}`} call={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallRow({ call }: { call: ApiCall }) {
  const status = call.status === true ? "success" : call.status === false ? "failed" : "—";
  return (
    <tr className={call.category ?? ""}>
      <td className="mono dim" style={{ fontSize: 10.5, wordBreak: "break-all" }}>
        {call.timestamp}
      </td>
      <td className="mono dim">{call.thread_id}</td>
      <td className="mono dim" style={{ fontSize: 10, lineHeight: 1.4, wordBreak: "break-all" }}>
        {call.caller}
        {call.parentcaller ? (
          <>
            <br />
            <span style={{ opacity: 0.55 }}>{call.parentcaller}</span>
          </>
        ) : null}
      </td>
      <td
        className="mono"
        style={{ fontWeight: 700, color: "var(--color-fg-0)", wordBreak: "break-all" }}
      >
        {call.api}
      </td>
      <td style={{ wordWrap: "break-word", fontSize: 10.5, lineHeight: 1.5 }}>
        <ArgumentsCell args={call.arguments ?? []} />
      </td>
      <td
        style={{
          color:
            call.status === true
              ? "var(--color-sev-clean)"
              : call.status === false
                ? "var(--color-sev-high)"
                : "var(--color-fg-2)",
          fontSize: 10.5,
        }}
      >
        {status}
      </td>
      <td
        className="mono"
        style={{ fontSize: 10.5, wordBreak: "break-all" }}
        title={call.return_value ?? ""}
      >
        {call.pretty_return || call.return_value || "—"}
      </td>
      <td className="dim" style={{ fontSize: 10.5 }}>
        {call.repeated && call.repeated > 0
          ? `${call.repeated} ${call.repeated === 1 ? "time" : "times"}`
          : ""}
      </td>
    </tr>
  );
}

function ArgumentsCell({ args }: { args: ApiCallArgument[] }) {
  if (!args || args.length === 0) return <span className="dim">—</span>;
  return (
    <>
      {args.map((a, i) => (
        <div key={`${a.name}-${i}`} style={{ marginBottom: 1 }}>
          <span className="dim" style={{ marginRight: 4 }}>
            {a.name}:
          </span>
          {a.pretty_value ? (
            <span className="mono" title={a.value} style={{ color: "var(--color-fg-0)" }}>
              {a.pretty_value}
            </span>
          ) : (
            <span className="mono" style={{ color: "var(--color-fg-1)" }}>
              {a.value}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Search pane (mirrors upstream `_search.html`)
// ---------------------------------------------------------------------------

function SearchPane({ taskId }: { taskId: number }) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const search = useReportBehaviorSearch(taskId, submitted);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(draft);
        }}
        style={{
          display: "flex",
          gap: 6,
          maxWidth: 520,
          margin: "0 auto 14px auto",
        }}
      >
        <input
          type="text"
          className="input"
          style={{ flex: 1, fontSize: 11.5 }}
          placeholder="Enter search term…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn">
          🔎 Search
        </button>
      </form>

      {submitted.trim().length < 2 ? (
        <Centered>
          <span className="dim">Type at least 2 characters and submit to search.</span>
        </Centered>
      ) : search.isLoading ? (
        <Centered>
          <Spinner size={14} />
          <span style={{ marginLeft: 8 }}>Searching…</span>
        </Centered>
      ) : !search.data ? (
        <Centered>
          <span className="dim">No results.</span>
        </Centered>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.keys(search.data.summary_hits).length > 0 && (
            <div className="panel">
              <div className="panel-h">Summary buckets</div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(search.data.summary_hits).map(([bucket, items]) => (
                  <div key={bucket}>
                    <div
                      className="dim mono"
                      style={{ fontSize: 10.5, textTransform: "uppercase", marginBottom: 4 }}
                    >
                      {bucket} · {items.length}
                    </div>
                    <ul
                      style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {items.slice(0, 20).map((it, i) => (
                        <li
                          key={`${bucket}-${i}`}
                          style={{
                            padding: "1px 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={it}
                        >
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {search.data.call_hits.length > 0 && (
            <div className="panel">
              <div className="panel-h">
                API call hits <span className="count">· {search.data.call_hits.length}</span>
              </div>
              <div style={{ padding: 14 }}>
                <table className="data mono" style={{ width: "100%", fontSize: 10.5 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>PID</th>
                      <th style={{ width: 130 }}>Process</th>
                      <th>API</th>
                      <th>Caller</th>
                      <th style={{ width: 60 }}>TID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.data.call_hits.slice(0, 100).map((h, i) => (
                      <tr key={`hit-${i}`}>
                        <td className="dim">{h.pid}</td>
                        <td>{h.process_name}</td>
                        <td>{h.call.api}</td>
                        <td className="dim">{h.call.caller}</td>
                        <td className="dim">{h.call.thread_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Object.keys(search.data.summary_hits).length === 0 &&
            search.data.call_hits.length === 0 && (
              <Centered>
                <span className="dim">No matches for "{submitted}".</span>
              </Centered>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function PillButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--color-accent)" : "transparent",
        color: active ? "var(--color-bg-0)" : "var(--color-fg-1)",
        border: active ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
        borderRadius: 4,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
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
        padding: 20,
        fontSize: 12,
        color: "var(--color-fg-2)",
      }}
    >
      {children}
    </div>
  );
}
