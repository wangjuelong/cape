import { useMemo } from "react";
import { Upload, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { StatusPill } from "@/components/recent/StatusPill";
import { useTaskList } from "@/hooks/useTaskList";
import { useMachines } from "@/hooks/useMachines";
import { useTaskEvents } from "@/hooks/useTaskEvents";

/**
 * Dashboard — live triage view. Mirrors the design's PageDashboard layout:
 *   row 1: 6 stat tiles
 *   row 2: live tasks · machines · families
 *   row 3: recent reports · top signatures
 *
 * Wired to v3 endpoints where data exists; family/sig top-N stay empty until
 * the backend aggregates land.
 */
export default function DashboardRoute() {
  const tasks = useTaskList({ limit: 50 });
  const machines = useMachines();
  const { connected } = useTaskEvents();

  const counts = useMemo(() => {
    const c = { pending: 0, running: 0, reported: 0, completed: 0, failed: 0 };
    for (const t of tasks.tasks) {
      if (t.status === "pending") c.pending++;
      else if (t.status === "running") c.running++;
      else if (t.status === "reported") c.reported++;
      else if (t.status === "completed") c.completed++;
      else c.failed++;
    }
    return c;
  }, [tasks.tasks]);

  const reportedTasks = useMemo(
    () => tasks.tasks.filter((t) => t.status === "reported").slice(0, 8),
    [tasks.tasks],
  );

  const liveTasks = useMemo(() => tasks.tasks.slice(0, 7), [tasks.tasks]);

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Dashboard"]}
        actions={
          <>
            <LiveIndicator connected={connected} />
            <button type="button" className="btn" onClick={() => tasks.refetch()}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <Link to="/submit" className="btn primary">
              <Upload size={14} />
              <span>New analysis</span>
            </Link>
          </>
        }
      />

      <div className="scroll" style={{ padding: 14 }}>
        {/* row 1: stat tiles */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <Tile label="Total loaded" value={tasks.tasks.length} />
          <Tile label="Pending" value={counts.pending} color="var(--color-sev-med)" />
          <Tile label="Running" value={counts.running} color="var(--color-accent)" />
          <Tile label="Reported" value={counts.reported} color="var(--color-sev-clean)" />
          <Tile label="Completed" value={counts.completed} />
          <Tile label="Failed" value={counts.failed} color="var(--color-sev-crit)" />
        </div>

        {/* row 2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1.2fr",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div className="panel">
            <div className="panel-h">
              Live tasks <span className="count">· {liveTasks.length}</span>
              <div className="actions">
                <Link to="/recent" className="btn ghost" style={{ height: 22, fontSize: 11 }}>
                  view all →
                </Link>
              </div>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>ID</th>
                  <th>Target</th>
                  <th style={{ width: 100 }}>Family</th>
                  <th style={{ width: 110 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {liveTasks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dim" style={{ textAlign: "center" }}>
                      No active tasks.
                    </td>
                  </tr>
                ) : (
                  liveTasks.map((t, i) => (
                    <tr key={t.id} className={i === 0 ? "sel" : undefined}>
                      <td>
                        <Link
                          to={`/tasks/${t.id}`}
                          style={{ color: "var(--color-accent)", textDecoration: "none" }}
                        >
                          #{t.id}
                        </Link>
                      </td>
                      <td style={{ color: "var(--color-fg-0)" }}>{t.target}</td>
                      <td>
                        {t.family ? (
                          <span
                            className={
                              "tag " + (t.score >= 8 ? "crit" : t.score >= 6 ? "high" : "med")
                            }
                          >
                            {t.family}
                          </span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td>
                        <StatusPill status={t.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-h">
              Analysis machines <span className="count">· {machines.data?.length ?? 0}</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {(machines.data ?? []).slice(0, 8).map((m) => (
                <div
                  key={m.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10px 1fr auto",
                    gap: 10,
                    padding: "7px 12px",
                    alignItems: "center",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: m.locked ? "var(--color-accent)" : "var(--color-sev-clean)",
                      boxShadow: m.locked ? "0 0 6px var(--color-accent)" : undefined,
                    }}
                  />
                  <div>
                    <div className="mono" style={{ color: "var(--color-fg-0)", fontSize: 12 }}>
                      {m.label}
                    </div>
                    <div className="mono dim" style={{ fontSize: 10.5 }}>
                      {m.platform || "—"} · {m.locked ? "busy" : "idle"}
                    </div>
                  </div>
                </div>
              ))}
              {machines.isLoading && (
                <div className="dim mono" style={{ padding: 12, fontSize: 11 }}>
                  Loading machines…
                </div>
              )}
              {(machines.data?.length ?? 0) === 0 && !machines.isLoading && (
                <div className="dim mono" style={{ padding: 12, fontSize: 11 }}>
                  No machines configured.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">Status breakdown</div>
            <div style={{ padding: 10 }}>
              {[
                { label: "Reported", count: counts.reported, color: "clean" as const },
                { label: "Completed", count: counts.completed, color: "low" as const },
                { label: "Running", count: counts.running, color: "med" as const },
                { label: "Pending", count: counts.pending, color: "high" as const },
                { label: "Failed", count: counts.failed, color: "crit" as const },
              ].map((row) => {
                const max = Math.max(
                  counts.reported,
                  counts.completed,
                  counts.running,
                  counts.pending,
                  counts.failed,
                  1,
                );
                return (
                  <div
                    key={row.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 1fr 36px",
                      gap: 8,
                      alignItems: "center",
                      padding: "5px 0",
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: "var(--color-fg-1)" }}>{row.label}</span>
                    <div className="prog" style={{ height: 6 }}>
                      <i
                        style={{
                          width: `${(row.count / max) * 100}%`,
                          background: `var(--color-sev-${row.color})`,
                        }}
                      />
                    </div>
                    <span className="mono dim" style={{ textAlign: "right", fontSize: 11 }}>
                      {row.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* row 3 */}
        <div className="panel">
          <div className="panel-h">
            Recent reports <span className="count">· {reportedTasks.length} latest</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 64 }}>ID</th>
                <th>Target</th>
                <th style={{ width: 80 }}>Pkg</th>
                <th style={{ width: 100 }}>Family</th>
                <th style={{ width: 60 }}>Score</th>
                <th style={{ width: 70 }}>Sigs</th>
                <th style={{ width: 90 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {reportedTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="dim" style={{ textAlign: "center" }}>
                    No reports yet.
                  </td>
                </tr>
              ) : (
                reportedTasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        to={`/tasks/${t.id}`}
                        style={{ color: "var(--color-accent)", textDecoration: "none" }}
                      >
                        #{t.id}
                      </Link>
                    </td>
                    <td style={{ color: "var(--color-fg-0)" }}>{t.target}</td>
                    <td>{t.package ? <span className="tag">{t.package}</span> : "—"}</td>
                    <td>
                      {t.family ? (
                        <span
                          className={
                            "tag " + (t.score >= 8 ? "crit" : t.score >= 6 ? "high" : "med")
                          }
                        >
                          {t.family}
                        </span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "tag " +
                          (t.score >= 8
                            ? "crit"
                            : t.score >= 6
                              ? "high"
                              : t.score >= 3
                                ? "med"
                                : t.score >= 1
                                  ? "low"
                                  : "clean")
                        }
                      >
                        {t.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="mono">{t.signatures_count}</td>
                    <td className="mono dim">{formatTime(t.submitted)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface TileProps {
  label: string;
  value: number | string;
  color?: string;
}

function Tile({ label, value, color }: TileProps) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="val" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
