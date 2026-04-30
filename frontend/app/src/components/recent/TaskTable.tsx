import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { ScoreBadge } from "./ScoreBadge";
import { StatusPill } from "./StatusPill";
import type { TaskSummary } from "@/types/api";

interface TaskTableProps {
  data: TaskSummary[];
}

/**
 * Recent tasks table — mirrors the design's `table.data` from
 * frontend/web-design/cape-pages-1.jsx PageRecent.
 */
export function TaskTable({ data }: TaskTableProps) {
  if (data.length === 0) {
    return (
      <div
        className="dim"
        style={{ padding: "32px 16px", fontSize: 12, textAlign: "center" }}
      >
        No tasks match the current filter.
      </div>
    );
  }

  return (
    <table className="data">
      <thead>
        <tr>
          <th style={{ width: 32 }}>
            <input type="checkbox" className="chk" />
          </th>
          <th style={{ width: 64 }}>ID</th>
          <th style={{ width: 50 }}>Pkg</th>
          <th>Target</th>
          <th style={{ width: 120 }}>Family</th>
          <th style={{ width: 60 }}>Score</th>
          <th style={{ width: 60 }}>Sigs</th>
          <th>MD5</th>
          <th style={{ width: 130 }}>Machine</th>
          <th style={{ width: 110 }}>Status</th>
          <th style={{ width: 90 }}>Submitted</th>
          <th style={{ width: 32 }} />
        </tr>
      </thead>
      <tbody>
        {data.map((t, i) => (
          <tr key={t.id} className={i === 0 ? "sel" : undefined}>
            <td onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" className="chk" />
            </td>
            <td>
              <Link
                to={`/tasks/${t.id}`}
                style={{ color: "var(--color-accent)", textDecoration: "none" }}
              >
                #{t.id}
              </Link>
            </td>
            <td>
              {t.package ? (
                <span className="tag">{t.package}</span>
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td style={{ color: "var(--color-fg-0)" }}>
              <Link
                to={`/tasks/${t.id}`}
                style={{ color: "inherit", textDecoration: "none" }}
                title={t.target}
              >
                {t.target}
              </Link>
            </td>
            <td>
              {t.family ? (
                <span
                  className={
                    "tag " +
                    (t.score >= 8 ? "crit" : t.score >= 6 ? "high" : "med")
                  }
                >
                  {t.family}
                </span>
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td>
              {t.status === "reported" || t.status === "completed" ? (
                <ScoreBadge score={t.score} severity={t.severity} />
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td className="mono">{t.signatures_count || <span className="dim">—</span>}</td>
            <td className="dim">{t.md5 || "—"}</td>
            <td>{t.machine || <span className="dim">—</span>}</td>
            <td>
              <StatusPill status={t.status} />
            </td>
            <td className="dim">{formatRel(t.submitted)}</td>
            <td>
              <ChevronRight size={14} style={{ color: "var(--color-fg-3)" }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatRel(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
