import type { ReportSummary } from "@/lib/api/reports";

interface SummaryTabProps {
  report: ReportSummary;
}

const BEHAVIOR_LABELS: Array<[string, keyof NonNullable<ReportSummary["behavior_summary"]>]> = [
  ["Files", "files"],
  ["Files written", "write_files"],
  ["Files deleted", "delete_files"],
  ["Registry keys", "registry_keys"],
  ["Mutexes", "mutexes"],
  ["Executed commands", "executed_commands"],
  ["Resolved APIs", "resolved_apis"],
];

/**
 * Summary tab — port of the design's center pane in PageReport summary.
 * Uses .panel/.kv/.tag for visuals.
 */
export function SummaryTab({ report }: SummaryTabProps) {
  const populated = BEHAVIOR_LABELS.filter(
    ([, key]) => (report.behavior_summary?.[key]?.length ?? 0) > 0,
  );

  return (
    <div className="scroll" style={{ padding: 14 }}>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          Verdict <span className="count">· task #{report.task.id}</span>
        </div>
        <div style={{ padding: 14 }}>
          <dl className="kv" style={{ gridTemplateColumns: "150px 1fr" }}>
            <dt>score</dt>
            <dd>{report.score?.toFixed(1) ?? "—"}</dd>
            <dt>severity</dt>
            <dd>
              <span className={"tag " + report.severity}>{report.severity}</span>
            </dd>
            <dt>verdict</dt>
            <dd style={{ color: `var(--color-sev-${report.severity})` }}>{report.verdict}</dd>
            <dt>family</dt>
            <dd>{report.family ?? <span className="dim">—</span>}</dd>
            <dt>available sections</dt>
            <dd style={{ whiteSpace: "normal" }}>
              {report.available_sections.map((s) => (
                <span key={s} className="tag" style={{ marginRight: 4, marginBottom: 4 }}>
                  {s}
                </span>
              ))}
            </dd>
          </dl>
        </div>
      </div>

      {populated.length > 0 && (
        <div className="panel">
          <div className="panel-h">Behavior summary</div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {populated.map(([label, key]) => {
              const items = report.behavior_summary?.[key] ?? [];
              return (
                <div key={label}>
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
                    <span style={{ marginLeft: 6 }}>· {items.length}</span>
                  </div>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--color-fg-1)",
                    }}
                  >
                    {items.slice(0, 10).map((item) => (
                      <li
                        key={item}
                        style={{
                          padding: "2px 0",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={item}
                      >
                        {item}
                      </li>
                    ))}
                    {items.length > 10 && (
                      <li className="dim mono" style={{ padding: "2px 0", fontSize: 10.5 }}>
                        … and {items.length - 10} more
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
