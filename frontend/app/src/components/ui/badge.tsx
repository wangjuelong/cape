import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-bg-3)] text-[var(--color-fg-1)]",
        crit: "bg-[var(--color-sev-crit)]/15 text-[var(--color-sev-crit)]",
        high: "bg-[var(--color-sev-high)]/15 text-[var(--color-sev-high)]",
        med: "bg-[var(--color-sev-med)]/15 text-[var(--color-sev-med)]",
        low: "bg-[var(--color-sev-low)]/15 text-[var(--color-sev-low)]",
        clean: "bg-[var(--color-sev-clean)]/15 text-[var(--color-sev-clean)]",
        outline: "border border-[var(--color-border)] text-[var(--color-fg-1)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
