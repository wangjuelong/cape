import type { Severity } from "@/types/api";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  severity: Severity;
}

const SEV_COLOR: Record<Severity, string> = {
  crit: "var(--color-sev-crit)",
  high: "var(--color-sev-high)",
  med: "var(--color-sev-med)",
  low: "var(--color-sev-low)",
  clean: "var(--color-sev-clean)",
};

export function ScoreBadge({ score, severity }: ScoreBadgeProps) {
  const color = SEV_COLOR[severity];
  const display = score === null ? "—" : score.toFixed(1);
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-9 items-center justify-center rounded-sm px-1.5 text-[11px] font-mono font-semibold",
      )}
      style={{
        background: `color-mix(in oklch, ${color} 18%, transparent)`,
        color,
      }}
    >
      {display}
    </span>
  );
}
