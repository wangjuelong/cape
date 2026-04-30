import type { TaskStatus } from "@/types/api";

interface StatusConfig {
  glyph: string;
  label: string;
  color: string;
}

const COLORS: Record<TaskStatus, StatusConfig> = {
  pending: { glyph: "○", label: "pending", color: "var(--color-sev-med)" },
  running: { glyph: "●", label: "running", color: "var(--color-accent)" },
  completed: { glyph: "✓", label: "completed", color: "var(--color-fg-1)" },
  reported: { glyph: "✓", label: "reported", color: "var(--color-sev-clean)" },
  failed_analysis: { glyph: "✗", label: "failed: analysis", color: "var(--color-sev-crit)" },
  failed_processing: { glyph: "✗", label: "failed: processing", color: "var(--color-sev-crit)" },
  failed_reporting: { glyph: "✗", label: "failed: reporting", color: "var(--color-sev-crit)" },
};

/**
 * Inline status badge mirroring the design's `<span style={color: …}>● running</span>`
 * pattern from `cape-pages-1.jsx`.
 */
export function StatusPill({ status }: { status: TaskStatus }) {
  const conf = COLORS[status] ?? COLORS.pending;
  return (
    <span style={{ color: conf.color }}>
      {conf.glyph} {conf.label}
    </span>
  );
}
