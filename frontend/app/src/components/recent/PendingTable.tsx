import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle } from "lucide-react";

import { deleteTask } from "@/lib/api/tasks";
import type { TaskSummary } from "@/types/api";

interface PendingTableProps {
  data: TaskSummary[];
  onDeleted?: (taskId: number) => void;
}

/**
 * Pending-tasks table — column layout mirrors upstream
 * `web/templates/analysis/pending.html`:
 *   ID · Timestamp · Category · Target · Hashes · Action(delete)
 */
export function PendingTable({ data, onDeleted }: PendingTableProps) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: (_resp, id) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onDeleted?.(id);
    },
  });

  return (
    <table className="data" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>ID</th>
          <th style={{ width: 150 }}>Timestamp</th>
          <th style={{ width: 90, textAlign: "center" }}>Category</th>
          <th>Target</th>
          <th style={{ width: 280 }}>Hashes</th>
          <th style={{ width: 80, textAlign: "center" }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {data.length === 0 && (
          <tr>
            <td
              colSpan={6}
              className="dim"
              style={{
                textAlign: "center",
                padding: "60px 20px",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "normal",
              }}
            >
              <div style={{ marginBottom: 8, color: "var(--color-sev-clean)" }}>
                ✓
              </div>
              No pending tasks. You&apos;re all caught up!
            </td>
          </tr>
        )}
        {data.map((t) => (
          <tr key={t.id}>
            <td>
              <Link
                to={`/tasks/${t.id}`}
                style={{
                  color: "var(--color-accent)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                #{t.id}
              </Link>
            </td>
            <td className="dim">{formatTs(t.submitted)}</td>
            <td style={{ textAlign: "center" }}>
              <span
                className="tag"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                  borderColor: "rgba(77,212,255,0.25)",
                  textTransform: "uppercase",
                }}
              >
                {(t.package || "file").toUpperCase()}
              </span>
            </td>
            <td
              className="text-truncate"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--color-fg-0)",
              }}
              title={t.target}
            >
              {basename(t.target)}
            </td>
            <td className="mono" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
              <div
                className="dim"
                style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                title={`MD5: ${t.md5 ?? ""}`}
              >
                <span style={{ color: "var(--color-fg-3)", marginRight: 4 }}>MD5:</span>
                <span style={{ color: "var(--color-fg-1)" }}>{t.md5 || "—"}</span>
              </div>
              <div
                style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                title={`SHA256: ${t.sha256 ?? ""}`}
              >
                <span style={{ color: "var(--color-fg-3)", marginRight: 4 }}>SHA256:</span>
                <span style={{ color: "var(--color-fg-1)" }}>
                  {t.sha256 || "—"}
                </span>
              </div>
            </td>
            <td style={{ textAlign: "center" }}>
              <button
                type="button"
                className="icon-btn"
                title="Delete pending task"
                onClick={() => {
                  if (window.confirm(`Delete pending task #${t.id}?`)) {
                    del.mutate(t.id);
                  }
                }}
                disabled={del.isPending}
                style={{ color: "var(--color-sev-crit)" }}
              >
                <Trash2 size={13} />
              </button>
              {del.isError && (
                <AlertTriangle
                  size={13}
                  style={{ color: "var(--color-sev-crit)", marginLeft: 6 }}
                  aria-label="delete failed"
                />
              )}
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
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}
