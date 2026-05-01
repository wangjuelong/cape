import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  Calendar,
  ChartLine,
  CheckCircle2,
  Cpu,
  FileText,
  Globe,
  Layers,
  ShieldCheck,
} from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStatistics } from "@/hooks/useStatistics";
import type { ModuleRow } from "@/lib/api/statistics";

/**
 * Statistics — mirrors upstream `templates/statistics.html` rendered by
 * `web/analysis/views.py:statistics_data(request, days=7)`.
 *
 * Sections (always present, in this order):
 *   1. Statistics Overview   (3 stat tiles: Timeframe / Total / Avg-per-day)
 *   2. Top Detections        (table, only if data)
 *   3. Top ASN               (table, only if data)
 *   4. Tasks per Day         (table)
 *   5. Custom Stats          (table, only if data)
 *   6. Module Performance    (3-column row: Processing / Signatures / Reporting)
 *   7. Cluster Details       (distributed_tasks, only if data)
 */

const PRESET_DAYS = [1, 7, 14, 30, 90, 365] as const;

export default function StatsRoute() {
  const params = useParams<{ days?: string }>();
  const navigate = useNavigate();
  const days = clampDays(Number(params.days) || 7);

  const stats = useStatistics(days);

  const overview = useMemo(
    () => [
      { label: "Timeframe", value: `${days}`, suffix: " days", icon: <Calendar size={14} /> },
      { label: "Total Tasks", value: stats.data?.total ?? 0, icon: <Activity size={14} /> },
      { label: "Average per Day", value: (stats.data?.average ?? 0).toFixed(2), icon: <ChartLine size={14} /> },
    ],
    [days, stats.data?.total, stats.data?.average],
  );

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Statistics"]}
        actions={
          <div style={{ display: "flex", gap: 4 }}>
            {PRESET_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={"btn" + (d === days ? " primary" : "")}
                onClick={() => navigate(`/stats/${d}`)}
                style={{ padding: "0 10px" }}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ===== Statistics Overview ===== */}
          <div className="panel">
            <div className="panel-h">
              <ChartLine size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
              Statistics Overview
            </div>
            <div
              style={{
                padding: "18px 14px",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
              }}
            >
              {overview.map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  <div
                    className="dim mono"
                    style={{
                      fontSize: 10.5,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {tile.icon}
                    {tile.label}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 28,
                      fontWeight: 600,
                      color: "var(--color-fg-0)",
                    }}
                  >
                    {tile.value}
                    {"suffix" in tile && tile.suffix && (
                      <small
                        className="dim"
                        style={{ fontSize: 14, marginLeft: 6, fontWeight: 400 }}
                      >
                        {tile.suffix}
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {stats.isFetching && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                color: "var(--color-fg-2)",
                fontSize: 12,
              }}
            >
              <Spinner size={14} />
              <span>Loading statistics…</span>
            </div>
          )}

          {(stats.isError || stats.data?.error) && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertTitle>Failed to load statistics</AlertTitle>
              <AlertDescription>
                {stats.data?.error ?? (stats.error as Error)?.message}
              </AlertDescription>
            </Alert>
          )}

          {/* ===== Top Detections ===== */}
          {(stats.data?.detections ?? []).length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <ShieldCheck size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Top Detections
              </div>
              <KeyCountTable
                rows={(stats.data?.detections ?? []).map((d) => ({
                  name: d.family,
                  count: d.count,
                }))}
                nameLabel="Family"
              />
            </div>
          )}

          {/* ===== Top ASN ===== */}
          {(stats.data?.asns ?? []).length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <Globe size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Top ASN
              </div>
              <KeyCountTable
                rows={(stats.data?.asns ?? []).map((a) => ({ name: a.asn, count: a.count }))}
                nameLabel="ASN"
              />
            </div>
          )}

          {/* ===== Tasks per Day ===== */}
          <div className="panel">
            <div className="panel-h">
              <Calendar
                size={13}
                style={{
                  marginRight: 6,
                  verticalAlign: -2,
                  color: "var(--color-sev-clean)",
                }}
              />
              Tasks per Day
            </div>
            <table className="data" id="tasks-per-day">
              <thead>
                <tr>
                  <th>Day</th>
                  <th style={{ textAlign: "right" }}>Added</th>
                  <th style={{ textAlign: "right" }}>Reported</th>
                  <th style={{ textAlign: "right" }}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {(stats.data?.tasks_per_day ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="dim" style={{ textAlign: "center", padding: 24 }}>
                      No task activity in this window.
                    </td>
                  </tr>
                )}
                {(stats.data?.tasks_per_day ?? []).map((row) => (
                  <tr key={row.day}>
                    <td style={{ color: "var(--color-fg-0)" }}>{row.day}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className="tag">{row.added}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="tag clean">
                        <CheckCircle2 size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                        {row.reported}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span
                        className={"tag " + (row.failed > 0 ? "crit" : "")}
                      >
                        {row.failed}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== Custom Stats ===== */}
          {(stats.data?.custom_statistics ?? []).length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <Layers size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Custom Stats
              </div>
              <ModuleTable rows={stats.data?.custom_statistics ?? []} />
            </div>
          )}

          {/* ===== Module Performance ===== */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            <div className="panel">
              <div className="panel-h">
                <Cpu size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Processing
              </div>
              <ModuleTable rows={stats.data?.processing ?? []} />
            </div>
            <div className="panel">
              <div className="panel-h">
                <ShieldCheck size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Signatures
              </div>
              <ModuleTable rows={stats.data?.signatures ?? []} />
            </div>
            <div className="panel">
              <div className="panel-h">
                <FileText size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Reporting
              </div>
              <ModuleTable rows={stats.data?.reporting ?? []} />
            </div>
          </div>

          {/* ===== Cluster Details ===== */}
          {(stats.data?.distributed_tasks ?? []).length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <Layers size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Cluster Details
              </div>
              <table className="data">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Node</th>
                    <th style={{ textAlign: "right" }}>Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.data!.distributed_tasks.map((d, i) => (
                    <tr key={`${d.day}-${d.node}-${i}`}>
                      <td>{d.day}</td>
                      <td className="mono" style={{ color: "var(--color-fg-0)" }}>
                        {d.node}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="tag">{d.count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function clampDays(d: number): number {
  if (!Number.isFinite(d) || d <= 0) return 7;
  if (d > 3650) return 3650;
  return Math.floor(d);
}

interface ModuleTableProps {
  rows: ModuleRow[];
}

function ModuleTable({ rows }: ModuleTableProps) {
  if (rows.length === 0) {
    return (
      <div
        className="dim"
        style={{ textAlign: "center", padding: 24, fontSize: 12 }}
      >
        No data.
      </div>
    );
  }
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Name</th>
          <th style={{ textAlign: "right" }}>Total</th>
          <th style={{ textAlign: "right" }}>Runs</th>
          <th style={{ textAlign: "right" }}>Avg</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td
              className="text-truncate"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--color-fg-0)",
              }}
              title={r.name}
            >
              {r.name}
            </td>
            <td style={{ textAlign: "right" }}>{formatNum(r.total)}</td>
            <td style={{ textAlign: "right" }}>{r.runs}</td>
            <td style={{ textAlign: "right" }}>{formatNum(r.avg)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface KeyCountTableProps {
  rows: { name: string; count: number }[];
  nameLabel: string;
}

function KeyCountTable({ rows, nameLabel }: KeyCountTableProps) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>{nameLabel}</th>
          <th style={{ textAlign: "right" }}>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td style={{ color: "var(--color-fg-0)" }}>{r.name}</td>
            <td style={{ textAlign: "right" }}>
              <span className="tag">{r.count}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatNum(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.001) return n.toExponential(2);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
