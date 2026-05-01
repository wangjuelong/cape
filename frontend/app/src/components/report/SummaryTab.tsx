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
 * Summary tab — mirrors upstream's `/analysis/<id>/` Quick Overview pane
 * (Verdict + Analysis Details + Machine Information + File Information +
 * Behavior summary) so we don't drop fields the user expects to see.
 */
export function SummaryTab({ report }: SummaryTabProps) {
  const populated = BEHAVIOR_LABELS.filter(
    ([, key]) => (report.behavior_summary?.[key]?.length ?? 0) > 0,
  );
  // Fall back to TaskSummary when the dicts haven't been wired through —
  // ensures the cards still render against an older v3 backend.
  const analysisInfo = report.analysis_info ?? buildAnalysisInfoFallback(report);
  const machineInfo = report.machine_info ?? buildMachineInfoFallback(report);
  const fileInfo = report.file_info ?? buildFileInfoFallback(report);

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

      {Object.keys(analysisInfo).length > 0 && (
        <KvPanel title="Analysis Details" entries={analysisInfo} />
      )}

      {Object.keys(machineInfo).length > 0 && (
        <KvPanel title="Machine Information" entries={machineInfo} />
      )}

      {Object.keys(fileInfo).length > 0 && (
        <KvPanel title="File Information" entries={fileInfo} mono />
      )}

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

interface KvPanelProps {
  title: string;
  entries: Record<string, string>;
  mono?: boolean;
}

function KvPanel({ title, entries, mono }: KvPanelProps) {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">{title}</div>
      <div style={{ padding: 14 }}>
        <dl
          className={mono ? "kv mono" : "kv"}
          style={{
            gridTemplateColumns: "150px 1fr",
            fontSize: mono ? 11.5 : undefined,
          }}
        >
          {Object.entries(entries).map(([k, v]) => (
            <FragmentKv key={k} k={k} v={v} />
          ))}
        </dl>
      </div>
    </div>
  );
}

function FragmentKv({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={v}
      >
        {v || <span className="dim">—</span>}
      </dd>
    </>
  );
}

function buildAnalysisInfoFallback(r: ReportSummary): Record<string, string> {
  const t = r.task;
  const out: Record<string, string> = {};
  if (t.package) out["Package"] = t.package;
  if (t.started) out["Started"] = t.started;
  if (t.completed) out["Completed"] = t.completed;
  if (t.duration) out["Duration"] = t.duration;
  if (t.submitted) out["Submitted"] = t.submitted;
  return out;
}

function buildMachineInfoFallback(r: ReportSummary): Record<string, string> {
  return r.task.machine ? { Name: r.task.machine } : {};
}

function buildFileInfoFallback(r: ReportSummary): Record<string, string> {
  const t = r.task;
  const out: Record<string, string> = {};
  if (t.target) out["File Name"] = t.target;
  if (t.type) out["File Type"] = t.type;
  if (t.size) out["File Size"] = `${t.size} bytes`;
  if (t.md5) out["MD5"] = t.md5;
  if (t.sha1) out["SHA1"] = t.sha1;
  if (t.sha256) out["SHA256"] = t.sha256;
  return out;
}
