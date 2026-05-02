import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode, forwardRef } from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>((props, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.55)",
      zIndex: 50,
      animation: "fadeIn 120ms ease-out",
    }}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: number }
>(({ children, width = 420, style, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 32px)",
        background: "var(--color-bg-1)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        zIndex: 51,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "transparent",
          border: 0,
          color: "var(--color-fg-2)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
        }}
      >
        <X size={14} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--color-fg-0)",
      }}
    >
      {children}
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 14, overflow: "auto", display: "grid", gap: 10 }}>{children}</div>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
      }}
    >
      {children}
    </div>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
