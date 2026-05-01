import { ScoreBadge } from "@/components/recent/ScoreBadge";
import type { TaskSummary } from "@/types/api";

interface VerdictBannerProps {
  task: TaskSummary;
}

const VERDICT_TAG: Record<string, string> = {
  malicious: "crit",
  suspicious: "high",
  clean: "clean",
};

/**
 * Verdict banner — direct port of the design's verdict header
 * (frontend/web-design/cape-pages-report.jsx, the strip just below PageHead).
 */
export function VerdictBanner({ task }: VerdictBannerProps) {
  const tagSev = VERDICT_TAG[task.verdict] ?? "med";
  const gradient =
    task.severity === "crit"
      ? "linear-gradient(180deg, rgba(255,79,107,0.06), transparent)"
      : task.severity === "high"
        ? "linear-gradient(180deg, rgba(255,122,58,0.06), transparent)"
        : "linear-gradient(180deg, rgba(43,217,122,0.04), transparent)";

  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--color-border)",
        background: gradient,
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <ScoreBadge score={task.score} severity={task.severity} size="lg" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <span className={"tag " + tagSev} style={{ height: 20, fontSize: 11, fontWeight: 600 }}>
            ● {task.verdict.toUpperCase()}
          </span>
          {task.family && <span className="tag crit">{task.family}</span>}
          {task.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
          <span className="dim mono" style={{ fontSize: 11 }}>
            · task #{task.id}
            {task.machine ? ` · ${task.machine}` : ""}
            {task.duration ? ` · ${task.duration}` : ""}
          </span>
        </div>
        <div
          style={{
            fontSize: 18,
            color: "var(--color-fg-0)",
            fontWeight: 600,
            marginBottom: 2,
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={task.target}
        >
          {task.target}
        </div>
        {task.sha256 && (
          <div
            className="mono dim"
            style={{
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            sha256: {task.sha256}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, auto)",
          gap: 24,
          paddingRight: 8,
        }}
      >
        <Metric label="Signatures" value={task.signatures_count} accent="crit" />
        <Metric label="YARA" value={task.yara_matches} />
        <Metric label="API calls" value={formatCount(task.api_calls)} />
        <Metric label="Network" value={task.network_count} />
      </div>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: number | string;
  accent?: "crit" | "high" | "med" | "low" | "clean";
}

function Metric({ label, value, accent }: MetricProps) {
  const color = accent ? `var(--color-sev-${accent})` : "var(--color-fg-0)";
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--color-fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
