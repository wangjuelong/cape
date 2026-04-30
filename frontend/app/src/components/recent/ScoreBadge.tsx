import type { Severity } from "@/types/api";

interface ScoreBadgeProps {
  score: number | null;
  severity: Severity;
  size?: "sm" | "lg";
}

const SEV_KEY: Record<Severity, string> = {
  crit: "crit",
  high: "high",
  med: "med",
  low: "low",
  clean: "clean",
};

/**
 * Conic-gradient score badge — matches frontend/web-design/styles.css `.score-badge`.
 * Score is 0..10 → 0..360deg via the --val custom prop.
 */
export function ScoreBadge({ score, severity, size }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="dim mono" style={{ fontSize: 11 }}>
        —
      </span>
    );
  }
  const sevKey = SEV_KEY[severity] ?? "clean";
  const c = `var(--color-sev-${sevKey})`;
  return (
    <div
      className={"score-badge" + (size === "lg" ? " lg" : "")}
      style={{ "--val": score, "--c": c } as React.CSSProperties}
    >
      <span style={{ color: c }}>{score.toFixed(1)}</span>
    </div>
  );
}
