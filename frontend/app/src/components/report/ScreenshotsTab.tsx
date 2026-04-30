import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useReportScreenshots } from "@/hooks/useReportTabs";

interface ScreenshotsTabProps {
  taskId: number;
}

export function ScreenshotsTab({ taskId }: ScreenshotsTabProps) {
  const query = useReportScreenshots(taskId);
  const [active, setActive] = useState<number | null>(null);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading screenshots…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No screenshots</AlertTitle>
          <AlertDescription>
            CAPE has not captured any desktop screenshots for this task. This is normal for static
            analyses, URL tasks without browser instrumentation, or tasks still in progress.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const shots = query.data?.shots ?? [];
  if (shots.length === 0) return <Centered>No screenshots captured.</Centered>;

  const focused = active !== null ? shots[active] : null;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div
        className="flex items-center gap-2 border-b px-4 py-2 text-xs"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
      >
        <span style={{ color: "var(--color-fg-1)" }}>Screenshots</span>
        <span className="font-mono" style={{ color: "var(--color-fg-2)" }}>
          · {shots.length}
        </span>
      </div>
      <div
        className="grid gap-3 p-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {shots.map((s) => (
          <button
            key={s.index}
            type="button"
            onClick={() => setActive(s.index)}
            className="overflow-hidden rounded-md border transition-colors hover:border-[var(--color-accent)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg-2)" }}
          >
            <img
              src={s.thumbnail_url}
              alt={`screenshot ${s.index}`}
              loading="lazy"
              className="block w-full"
              style={{ aspectRatio: "16 / 10", objectFit: "cover" }}
            />
            <div className="px-2 py-1 text-[10px] font-mono" style={{ color: "var(--color-fg-2)" }}>
              #{s.index}
            </div>
          </button>
        ))}
      </div>

      {focused && (
        <Lightbox
          src={focused.url}
          alt={`screenshot ${focused.index}`}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

function Lightbox({ src, alt, onClose }: LightboxProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-md"
        style={{ border: "1px solid var(--color-border)" }}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center p-4 text-xs"
      style={{ color: "var(--color-fg-2)" }}
    >
      {children}
    </div>
  );
}
