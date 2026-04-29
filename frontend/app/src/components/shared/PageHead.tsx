import { Fragment, type ReactNode } from "react";

interface PageHeadProps {
  crumbs: string[];
  actions?: ReactNode;
}

export function PageHead({ crumbs, actions }: PageHeadProps) {
  return (
    <div
      className="flex h-12 items-center justify-between border-b px-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-fg-1)" }}>
        {crumbs.map((c, i) => (
          <Fragment key={`${i}:${c}`}>
            {i > 0 && <span style={{ color: "var(--color-fg-2)" }}>›</span>}
            <span style={i === crumbs.length - 1 ? { color: "var(--color-fg-0)" } : undefined}>
              {c}
            </span>
          </Fragment>
        ))}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
