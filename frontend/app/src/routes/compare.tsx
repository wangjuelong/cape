import { useState, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { GitCompare, FileText, Shuffle, Search, AlertTriangle, Info } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCompareCandidates, useCompareDiff } from "@/hooks/useCompare";
import type { TaskSummary } from "@/types/api";

/**
 * Compare — mirrors upstream `web/compare` (left.html / both.html).
 *
 * /compare/:left          → candidate picker (same-md5 analyses on the right
 *                            + a "compare with different file" md5 form)
 * /compare/:left/:right   → side-by-side diff (behavior summary intersection
 *                            + per-task category percentages)
 */
export default function CompareRoute() {
  const params = useParams<{ left?: string; right?: string }>();
  const navigate = useNavigate();
  const leftId = params.left ? Number(params.left) : null;
  const rightId = params.right ? Number(params.right) : null;
  const inDiffMode = leftId !== null && rightId !== null;

  return (
    <>
      <PageHead
        crumbs={
          inDiffMode
            ? ["CAPE", "Compare", `Task #${leftId}`, `vs Task #${rightId}`]
            : leftId !== null
              ? ["CAPE", "Compare", `Task #${leftId}`]
              : ["CAPE", "Compare"]
        }
      />
      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ padding: 14 }}>
          {leftId === null && <NoLeftSelected />}
          {leftId !== null && rightId === null && (
            <CandidatePicker leftId={leftId} navigate={navigate} />
          )}
          {leftId !== null && rightId !== null && (
            <DiffPane leftId={leftId} rightId={rightId} />
          )}
        </div>
      </div>
    </>
  );
}

function NoLeftSelected() {
  return (
    <div
      className="panel"
      style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-fg-2)" }}
    >
      <GitCompare size={36} style={{ color: "var(--color-fg-3)", marginBottom: 10 }} />
      <p style={{ margin: 0, fontSize: 14 }}>
        Compare entry needs a left task ID. Open a task report and click{" "}
        <code className="mono" style={{ color: "var(--color-accent)" }}>
          Compare
        </code>{" "}
        in the toolbar to select it.
      </p>
    </div>
  );
}

interface CandidatePickerProps {
  leftId: number;
  navigate: ReturnType<typeof useNavigate>;
}

function CandidatePicker({ leftId, navigate }: CandidatePickerProps) {
  const candidates = useCompareCandidates(leftId);
  const left = candidates.data?.left ?? null;
  const records = candidates.data?.records ?? [];

  const [hashInput, setHashInput] = useState("");
  function onHashSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = hashInput.trim();
    if (!v) return;
    // upstream /compare/<left>/<hash>/ — for the SPA we route to the
    // candidate page for that hash via /search?search=<hash> as a fallback,
    // since hashing arbitrary md5s back to a task id needs a roundtrip.
    navigate(`/search?search=${encodeURIComponent(v)}`);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* Left: Analysis 1 */}
      <div className="panel">
        <div className="panel-h">
          <FileText size={13} style={{ marginRight: 6, verticalAlign: -2, color: "var(--color-accent)" }} />
          Analysis {leftId}
        </div>
        {candidates.isLoading ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Spinner size={14} />
          </div>
        ) : left ? (
          <TaskOverviewTable rows={[left]} />
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-fg-2)" }}>
            Task {leftId} not found.
          </div>
        )}
      </div>

      {/* Right: Select Analysis 2 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h4
          style={{
            textAlign: "center",
            color: "var(--color-fg-0)",
            margin: "0 0 4px",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          <Shuffle size={14} style={{ color: "var(--color-sev-med)", marginRight: 6, verticalAlign: -2 }} />
          Select Analysis 2
        </h4>

        {/* Same File Analysis */}
        <div className="panel">
          <div className="panel-h">Same File Analysis</div>
          {candidates.isLoading ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <Spinner size={14} />
            </div>
          ) : records.length === 0 ? (
            <div style={{ padding: "20px 16px" }}>
              <Alert variant="info">
                <Info size={14} />
                <AlertDescription>
                  No other analysis found for this file.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <TaskOverviewTable
              rows={records}
              onPick={(t) => navigate(`/compare/${leftId}/${t.id}`)}
            />
          )}
        </div>

        {/* Compare with Different File */}
        <div className="panel">
          <div className="panel-h">Compare with Different File</div>
          <div style={{ padding: 14 }}>
            <p
              className="dim"
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                marginTop: 0,
                marginBottom: 10,
              }}
            >
              Enter MD5 hash to find a different analysis:
            </p>
            <form
              onSubmit={onHashSubmit}
              style={{ display: "flex", gap: 8 }}
              id="hash"
            >
              <input
                type="text"
                name="hash"
                placeholder="MD5 Hash"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                className="mono"
                style={{
                  flex: 1,
                  height: 32,
                  padding: "0 10px",
                  background: "var(--color-bg-2)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-fg-0)",
                  borderRadius: 3,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <button type="submit" className="btn">
                <Search size={12} />
                <span>Search</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TaskOverviewTableProps {
  rows: TaskSummary[];
  onPick?: (task: TaskSummary) => void;
}

function TaskOverviewTable({ rows, onPick }: TaskOverviewTableProps) {
  return (
    <table className="data" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>ID</th>
          <th>Name</th>
          <th style={{ width: 240 }}>MD5</th>
          <th style={{ width: 100 }}>Machine</th>
          <th style={{ width: 130 }}>Completed On</th>
          <th style={{ width: 60, textAlign: "right" }}>Dur.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr
            key={t.id}
            style={{ cursor: onPick ? "pointer" : "default" }}
            onClick={onPick ? () => onPick(t) : undefined}
          >
            <td>
              <Link
                to={`/tasks/${t.id}`}
                style={{
                  color: "var(--color-accent)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                #{t.id}
              </Link>
            </td>
            <td
              className="text-truncate"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={t.target}
            >
              {t.target || "—"}
            </td>
            <td className="mono" style={{ fontSize: 11, color: "var(--color-fg-1)" }}>
              {t.md5 || "—"}
            </td>
            <td>
              {t.machine ? (
                <span className="tag">{t.machine}</span>
              ) : (
                <span className="dim">—</span>
              )}
            </td>
            <td className="dim" style={{ fontSize: 11 }}>
              {formatTs(t.completed ?? t.submitted)}
            </td>
            <td className="dim" style={{ textAlign: "right" }}>
              {t.duration ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface DiffPaneProps {
  leftId: number;
  rightId: number;
}

function DiffPane({ leftId, rightId }: DiffPaneProps) {
  const diff = useCompareDiff(leftId, rightId);

  if (diff.isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <Spinner size={16} />
      </div>
    );
  }

  if (diff.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle size={14} />
        <AlertTitle>Failed to compare tasks</AlertTitle>
        <AlertDescription>{(diff.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const data = diff.data;
  if (!data) return null;

  // Union of category keys across both tasks
  const categories = Array.from(
    new Set([...Object.keys(data.left_counts ?? {}), ...Object.keys(data.right_counts ?? {})]),
  ).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Two task summaries side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <div className="panel">
          <div className="panel-h">
            <FileText size={13} style={{ marginRight: 6, verticalAlign: -2, color: "var(--color-accent)" }} />
            Analysis {leftId}
          </div>
          {data.left ? <TaskOverviewTable rows={[data.left]} /> : <Empty text="No data" />}
        </div>
        <div className="panel">
          <div className="panel-h">
            <FileText size={13} style={{ marginRight: 6, verticalAlign: -2, color: "var(--color-sev-med)" }} />
            Analysis {rightId}
          </div>
          {data.right ? <TaskOverviewTable rows={[data.right]} /> : <Empty text="No data" />}
        </div>
      </div>

      {/* Behavior category percentages */}
      <div className="panel">
        <div className="panel-h">
          Behavior categories <span className="count">· per-task percentages</span>
        </div>
        {categories.length === 0 ? (
          <Empty text="No category data — Mongo is unavailable or one of the tasks has no behavior dump." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ width: 120, textAlign: "right" }}>#{leftId}</th>
                <th style={{ width: 120, textAlign: "right" }}>#{rightId}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const l = (data.left_counts ?? {})[cat] ?? 0;
                const r = (data.right_counts ?? {})[cat] ?? 0;
                return (
                  <tr key={cat}>
                    <td style={{ color: "var(--color-fg-0)" }}>{cat}</td>
                    <td style={{ textAlign: "right" }}>{l.toFixed(2)}%</td>
                    <td style={{ textAlign: "right" }}>{r.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Behavior summary intersection */}
      <div className="panel">
        <div className="panel-h">
          Behavior summary intersection <span className="count">· {Object.keys(data.summary ?? {}).length} categories</span>
        </div>
        {Object.keys(data.summary ?? {}).length === 0 ? (
          <Empty text="No overlapping behavior summary keys between the two tasks." />
        ) : (
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(data.summary).map(([category, items]) => (
              <div key={category}>
                <div
                  className="dim mono"
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {category} <span className="count">· {items.length}</span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--color-fg-1)",
                  }}
                >
                  {items.slice(0, 20).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {items.length > 20 && (
                    <li className="dim">… and {items.length - 20} more</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="dim"
      style={{ padding: 24, textAlign: "center", fontSize: 12 }}
    >
      {text}
    </div>
  );
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace("T", " ");
}
