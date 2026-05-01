/**
 * Coloured chip for an audit action. Colour comes from the action's
 * category in the catalog + its success flag (auth+failure → red).
 */
import type { AuditActionDescriptor } from "@/lib/api/audits";

interface ActionBadgeProps {
  action: string;
  success: boolean;
  catalog: AuditActionDescriptor[];
}

export function ActionBadge({ action, success, catalog }: ActionBadgeProps) {
  const desc = catalog.find((d) => d.value === action);
  const label = desc?.label ?? action;
  const category = desc?.category ?? "auth";

  let bg = "var(--color-bg-2)";
  let fg = "var(--color-fg-1)";
  if (category === "auth") {
    bg = success ? "rgba(46, 204, 113, 0.18)" : "rgba(231, 76, 60, 0.18)";
    fg = success ? "var(--color-sev-clean)" : "var(--color-sev-crit)";
  } else if (category === "user_mgmt") {
    bg = "rgba(243, 156, 18, 0.18)";
    fg = "var(--color-sev-high)";
  } else if (category === "admin") {
    bg = "rgba(155, 89, 182, 0.18)";
    fg = "#bb8fce";
  }

  return (
    <span
      className="mono"
      style={{
        background: bg,
        color: fg,
        padding: "1px 6px",
        borderRadius: 3,
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
