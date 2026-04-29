import type { TaskStatus } from "@/types/api";

const COLORS: Record<TaskStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: "var(--color-bg-3)", fg: "var(--color-fg-1)", label: "Pending" },
  running: { bg: "var(--color-sev-low)", fg: "var(--color-bg-0)", label: "Running" },
  completed: { bg: "var(--color-bg-3)", fg: "var(--color-fg-0)", label: "Completed" },
  reported: { bg: "var(--color-sev-clean)", fg: "var(--color-bg-0)", label: "Reported" },
  failed_analysis: { bg: "var(--color-sev-crit)", fg: "white", label: "Failed (analysis)" },
  failed_processing: { bg: "var(--color-sev-crit)", fg: "white", label: "Failed (processing)" },
  failed_reporting: { bg: "var(--color-sev-crit)", fg: "white", label: "Failed (reporting)" },
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const conf = COLORS[status] ?? COLORS.pending;
  return (
    <span
      className="inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `color-mix(in oklch, ${conf.bg} 25%, transparent)`, color: conf.fg }}
    >
      {conf.label}
    </span>
  );
}
