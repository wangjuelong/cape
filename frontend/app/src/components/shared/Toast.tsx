import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TOAST_TIMEOUT_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 100,
          pointerEvents: "none",
        }}
      >
        {items.map((t) => (
          <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT_BG: Record<ToastVariant, string> = {
  success: "#23863622",
  error: "#da363322",
  info: "#1f6feb22",
};
const VARIANT_FG: Record<ToastVariant, string> = {
  success: "#7ee787",
  error: "#ff7b72",
  info: "#79c0ff",
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setEntering(false), 20);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      type="button"
      onClick={onDismiss}
      style={{
        pointerEvents: "auto",
        background: VARIANT_BG[item.variant],
        color: VARIANT_FG[item.variant],
        border: `1px solid ${VARIANT_FG[item.variant]}33`,
        borderRadius: 4,
        padding: "8px 12px",
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
        minWidth: 220,
        opacity: entering ? 0 : 1,
        transform: entering ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 160ms ease-out, transform 160ms ease-out",
      }}
    >
      {item.message}
    </button>
  );
}
