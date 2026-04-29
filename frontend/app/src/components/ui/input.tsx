import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-7 w-full rounded-sm border bg-[var(--color-bg-2)] px-2 text-xs",
        "border-[var(--color-border)] text-[var(--color-fg-0)] placeholder:text-[var(--color-fg-2)]",
        "file:border-0 file:bg-transparent file:text-xs file:font-medium",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
