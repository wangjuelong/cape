import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle, ChevronRight } from "lucide-react";

import { ScoreBadge } from "./ScoreBadge";
import { StatusPill } from "./StatusPill";
import { deleteTask } from "@/lib/api/tasks";
import type { TaskSummary } from "@/types/api";

/**
 * Analysis listing — column layout mirrors upstream
 * `web/templates/analysis/index.html` per category.
 *
 * Upstream Files / Static / URLS / PCAPs tabs all share the same column
 * set: ID, Timestamp, Package, Filename, Hashes (md5+sha256), Detections,
 * VT, Status. We reuse this component for all four tabs and tweak the
 * empty-state copy via props.
 */

interface AnalysisCategoryTableProps {
  data: TaskSummary[];
  category: "file" | "static" | "url" | "pcap";
  emptyIcon: React.ReactNode;
  emptyText: string;
  onDeleted?: (taskId: number) => void;
}

export function AnalysisCategoryTable({
  data,
  category,
  emptyIcon,
  emptyText,
  onDeleted,
}: AnalysisCategoryTableProps) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: (_resp, id) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onDeleted?.(id);
    },
  });

  const showFilenameCol = category !== "url";
  const showHashesCol = category !== "url";
  const colCount = 7 + (showHashesCol ? 1 : 0) + 1; // ID + ts + pkg + name + [hashes] + detections + vt + status + actions

  return (
    <table className="data" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>ID</th>
          <th style={{ width: 170 }}>Timestamp</th>
          <th style={{ width: 70 }}>Package</th>
          <th>{category === "url" ? "URL" : "Filename"}</th>
          {showHashesCol && <th style={{ width: 240 }}>Hashes</th>}
          <th style={{ width: 100 }}>Detections</th>
          <th style={{ width: 60 }}>VT</th>
          <th style={{ width: 110 }}>Status</th>
          <th style={{ width: 60 }} />
        </tr>
      </thead>
      <tbody>
        {data.length === 0 && (
          <tr>
            <td
              colSpan={colCount}
              className="dim"
              style={{
                textAlign: "center",
                padding: "48px 20px",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "normal",
              }}
            >
              <div style={{ marginBottom: 8, opacity: 0.5 }}>{emptyIcon}</div>
              {emptyText}
            </td>
          </tr>
        )}
        {data.map((t) => (
          <tr key={t.id}>
            <td>
              <Link
                to={`/tasks/${t.id}`}
                style={{ color: "var(--color-accent)", textDecoration: "none" }}
              >
                #{t.id}
              </Link>
            </td>
            <td className="dim mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
              {formatTs(t.submitted)}
            </td>
            <td>
              {t.package ? (
                <span className="tag">{t.package}</span>
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td
              className="text-truncate"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={t.target}
            >
              <Link
                to={`/tasks/${t.id}`}
                style={{ color: "var(--color-fg-0)", textDecoration: "none" }}
              >
                {showFilenameCol ? basename(t.target) : t.target}
              </Link>
            </td>
            {showHashesCol && (
              <td className="mono" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
                <div
                  className="dim"
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  title={t.md5 ?? ""}
                >
                  <span style={{ color: "var(--color-fg-3)", marginRight: 4 }}>MD5:</span>
                  <Link
                    to={`/tasks/${t.id}`}
                    style={{ color: "var(--color-fg-1)", textDecoration: "none" }}
                  >
                    {t.md5 ?? "—"}
                  </Link>
                </div>
                <div
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  title={t.sha256 ?? ""}
                >
                  <span style={{ color: "var(--color-fg-3)", marginRight: 4 }}>SHA256:</span>
                  <Link
                    to={`/tasks/${t.id}`}
                    style={{ color: "var(--color-fg-1)", textDecoration: "none" }}
                  >
                    {t.sha256 ? truncate(t.sha256, 24) : "—"}
                  </Link>
                </div>
              </td>
            )}
            <td>
              {t.family ? (
                <span className={"tag " + (t.score >= 8 ? "crit" : t.score >= 6 ? "high" : "med")}>
                  {t.family}
                </span>
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td>
              {t.score && t.score > 0 ? (
                <ScoreBadge score={t.score} severity={t.severity} />
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td>
              <StatusPill status={t.status} />
            </td>
            <td style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 0 }}>
              <button
                type="button"
                className="icon-btn"
                title="Delete this analysis"
                onClick={() => {
                  if (window.confirm(`Delete task #${t.id} and its analysis data?`)) {
                    del.mutate(t.id);
                  }
                }}
                disabled={del.isPending}
                style={{ color: "var(--color-fg-3)" }}
              >
                <Trash2 size={13} />
              </button>
              {del.isError && (
                <AlertTriangle
                  size={13}
                  style={{ color: "var(--color-sev-crit)" }}
                  aria-label="delete failed"
                />
              )}
              <Link
                to={`/tasks/${t.id}`}
                className="icon-btn"
                title="Open report"
                style={{ color: "var(--color-fg-3)" }}
              >
                <ChevronRight size={13} />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Mirror upstream's `2026-04-30 15:54:16` format
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
