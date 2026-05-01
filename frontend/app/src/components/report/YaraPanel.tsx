/**
 * "YARA / CAPE-YARA / ClamAV" matches against the target file.
 * Combined into one card matching upstream's `File Information` rule
 * tags. Hidden when there are no matches.
 */
import type { YaraMatch } from "@/lib/api/reports";

interface YaraPanelProps {
  matches: YaraMatch[];
}

export function YaraPanel({ matches }: YaraPanelProps) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        YARA Matches <span className="count">· {matches.length}</span>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.map((m, i) => (
          <div
            key={`${m.source}-${m.name}-${i}`}
            style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}
          >
            <span className="tag" style={{ fontSize: 10, opacity: 0.8 }}>
              {m.source}
            </span>
            <span className="mono" style={{ color: "var(--color-fg-1)", fontWeight: 600 }}>
              {m.name}
            </span>
            {m.meta && (
              <span className="dim" style={{ fontSize: 11 }}>
                {m.meta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
