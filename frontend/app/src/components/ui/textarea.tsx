import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-16 w-full rounded-sm border bg-[var(--color-bg-2)] px-2 py-1.5 text-xs",
      "border-[var(--color-border)] text-[var(--color-fg-0)] placeholder:text-[var(--color-fg-2)]",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
