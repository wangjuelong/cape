import { ScoreBadge } from "@/components/recent/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import type { TaskSummary } from "@/types/api";

interface VerdictBannerProps {
  task: TaskSummary;
}

export function VerdictBanner({ task }: VerdictBannerProps) {
  return (
    <div
      className="border-b px-4 py-3"
      style={{
        borderColor: "var(--color-border)",
        background:
          task.severity === "crit"
            ? "linear-gradient(180deg, color-mix(in oklch, var(--color-sev-crit) 8%, transparent), transparent)"
            : task.severity === "high"
              ? "linear-gradient(180deg, color-mix(in oklch, var(--color-sev-high) 8%, transparent), transparent)"
              : "var(--color-bg-1)",
      }}
    >
      <div className="flex items-start gap-4">
        <ScoreBadge score={task.score} severity={task.severity} />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={task.severity === "clean" ? "clean" : task.severity}>
              ● {task.verdict.toUpperCase()}
            </Badge>
            {task.family && <Badge variant="crit">{task.family}</Badge>}
            {task.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--color-fg-2)" }}
            >
              · task #{task.id}
              {task.machine ? ` · ${task.machine}` : ""}
              {task.duration ? ` · ${task.duration}` : ""}
            </span>
          </div>
          <div
            className="mb-1 truncate font-mono text-base font-semibold"
            title={task.target}
            style={{ color: "var(--color-fg-0)" }}
          >
            {task.target}
          </div>
          {task.sha256 && (
            <div
              className="truncate font-mono text-[11px]"
              style={{ color: "var(--color-fg-2)" }}
            >
              sha256: {task.sha256}
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-0 pr-2">
          <Metric label="Signatures" value={task.signatures_count} accent="crit" />
          <Metric label="YARA" value={task.yara_matches} />
          <Metric label="API calls" value={formatCount(task.api_calls)} />
          <Metric label="Network" value={task.network_count} />
        </div>
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
    <div className="flex flex-col items-end">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-fg-2)" }}
      >
        {label}
      </span>
      <span className="font-mono text-base font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
