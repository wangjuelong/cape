import type { SignatureLite } from "@/lib/api/reports";

const SEVERITY_KEY: Record<number, "crit" | "high" | "med" | "low" | "clean"> = {
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

/**
 * Findings rail — direct port of the design's left lane in PageReport summary
 * (`.sig-row` rendering, sorted by severity).
 */
export function FindingsRail({ signatures, selected, onSelect }: FindingsRailProps) {
  const sorted = [...signatures].sort((a, b) => b.severity - a.severity);

  return (
    <aside
      style={{
        width: 380,
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-1)",
        flexShrink: 0,
      }}
    >
      <div className="panel-h" style={{ borderBottom: "1px solid var(--color-border)" }}>
        Findings <span className="count">· {sorted.length}</span>
        <div className="actions">
          <span className="dim mono" style={{ fontSize: 10.5 }}>
            sort: severity
          </span>
        </div>
      </div>

      <div className="lane-scroll" style={{ flex: 1 }}>
        {sorted.length === 0 ? (
          <div
            className="dim"
            style={{ padding: 16, fontSize: 12, textAlign: "center" }}
          >
            No signatures matched.
          </div>
        ) : (
          sorted.map((sig) => {
            const sev = SEVERITY_KEY[sig.severity] ?? "low";
            const isSel = selected === sig.name;
            return (
              <div
                key={sig.name}
                className={"sig-row " + sev + (isSel ? " sel" : "")}
                onClick={() => onSelect?.(sig.name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(sig.name);
                  }
                }}
              >
                <div className="bar" />
                <div>
                  <div className="ttl">{sig.name}</div>
                  {sig.description && (
                    <div
                      className="desc"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {sig.description}
                    </div>
                  )}
                  {sig.ttp.length > 0 && (
                    <div className="att">
                      {sig.ttp.slice(0, 5).map((t) => (
                        <span key={t} className="tag" style={{ height: 14, fontSize: 9.5 }}>
                          {t}
                        </span>
                      ))}
                      {sig.ttp.length > 5 && (
                        <span className="dim mono" style={{ fontSize: 10 }}>
                          +{sig.ttp.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className={"tag " + sev}
                  style={{ height: 16, fontSize: 9.5, alignSelf: "start" }}
                >
                  {sev.toUpperCase()}
                </span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
