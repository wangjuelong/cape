import { Fragment, type ReactNode } from "react";

interface PageHeadProps {
  crumbs: string[];
  actions?: ReactNode;
}

export function PageHead({ crumbs, actions }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={`${i}:${c}`}>
            {i > 0 && <span className="sep">›</span>}
            <span className={i === crumbs.length - 1 ? "cur" : undefined}>{c}</span>
          </Fragment>
        ))}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
