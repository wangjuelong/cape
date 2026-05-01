/**
 * "Statistics" card — mirrors upstream's processing/signatures/reporting
 * timing breakdown table (`{name, time(s)}`).
 */
import type { ReportSummary } from "@/lib/api/reports";

interface StatisticsPanelProps {
  stats: NonNullable<ReportSummary["statistics_processing"]>;
}

const BUCKETS: Array<{ key: string; label: string }> = [
  { key: "processing", label: "Processing" },
  { key: "signatures", label: "Signatures" },
  { key: "reporting", label: "Reporting" },
];

export function StatisticsPanel({ stats }: StatisticsPanelProps) {
  const populated = BUCKETS.filter(({ key }) => (stats[key]?.length ?? 0) > 0);
  if (populated.length === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">Statistics</div>
      <div
        style={{
          padding: 14,
          display: "grid",
          gridTemplateColumns: `repeat(${populated.length}, 1fr)`,
          gap: 14,
        }}
      >
        {populated.map(({ key, label }) => {
          const items = stats[key]!;
          const total = items.reduce((acc, it) => acc + (it.time || 0), 0);
          return (
            <div key={key}>
              <div
                className="dim mono"
                style={{
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {label}
                <span style={{ marginLeft: 6 }}>· {total.toFixed(2)}s</span>
              </div>
              <table className="data mono" style={{ fontSize: 10.5, width: "100%" }}>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.name}>
                      <td
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={it.name}
                      >
                        {it.name}
                      </td>
                      <td style={{ width: 70, textAlign: "right" }} className="dim">
                        {it.time.toFixed(3)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
