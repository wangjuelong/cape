import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SignatureLite } from "@/lib/api/reports";

const SEVERITY_VARIANT: Record<number, "crit" | "high" | "med" | "low" | "clean"> = {
  5: "crit",
  4: "high",
  3: "med",
  2: "low",
  1: "clean",
};

interface FindingsRailProps {
  signatures: SignatureLite[];
  selected?: string | null;
  onSelect?: (name: string) => void;
}

export function FindingsRail({ signatures, selected, onSelect }: FindingsRailProps) {
  const sorted = [...signatures].sort((a, b) => b.severity - a.severity);

  return (
    <aside
      className="flex w-80 shrink-0 flex-col border-r"
      style={{
        background: "var(--color-bg-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="flex h-9 items-center justify-between border-b px-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--color-fg-0)" }}
        >
          Findings
          <span className="ml-1.5 font-mono" style={{ color: "var(--color-fg-2)" }}>
            · {sorted.length}
          </span>
        </span>
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--color-fg-2)" }}
        >
          sort: severity
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div
            className="p-4 text-center text-xs"
            style={{ color: "var(--color-fg-2)" }}
          >
            No signatures matched.
          </div>
        ) : (
          sorted.map((sig) => {
            const variant = SEVERITY_VARIANT[sig.severity] ?? "low";
            const isSelected = selected === sig.name;
            return (
              <button
                key={sig.name}
                type="button"
                onClick={() => onSelect?.(sig.name)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b px-3 py-2 text-left transition-colors",
                  isSelected ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-bg-2)]",
                )}
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-xs font-semibold"
                    style={{ color: "var(--color-fg-0)" }}
                  >
                    {sig.name}
                  </span>
                  <Badge variant={variant}>S{sig.severity}</Badge>
                </div>
                {sig.description && (
                  <span
                    className="line-clamp-2 text-[11px]"
                    style={{ color: "var(--color-fg-1)" }}
                  >
                    {sig.description}
                  </span>
                )}
                {sig.ttp.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {sig.ttp.slice(0, 5).map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                    {sig.ttp.length > 5 && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--color-fg-2)" }}
                      >
                        +{sig.ttp.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
