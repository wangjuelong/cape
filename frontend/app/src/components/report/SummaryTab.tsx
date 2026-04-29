import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportSummary } from "@/lib/api/reports";

interface SummaryTabProps {
  report: ReportSummary;
}

export function SummaryTab({ report }: SummaryTabProps) {
  const { behavior_summary } = report;
  const sections: Array<[string, string[] | undefined]> = [
    ["Files", behavior_summary?.files],
    ["Files written", behavior_summary?.write_files],
    ["Files deleted", behavior_summary?.delete_files],
    ["Registry keys", behavior_summary?.registry_keys],
    ["Mutexes", behavior_summary?.mutexes],
    ["Executed commands", behavior_summary?.executed_commands],
    ["Resolved APIs", behavior_summary?.resolved_apis],
  ];
  const populated = sections.filter(([, items]) => items && items.length > 0);

  return (
    <div className="space-y-3 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Verdict</CardTitle>
        </CardHeader>
        <CardContent>
          <dl
            className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs"
            style={{ color: "var(--color-fg-1)" }}
          >
            <Datum label="Score" value={report.score?.toFixed(1) ?? "—"} />
            <Datum label="Severity" value={report.severity} />
            <Datum label="Verdict" value={report.verdict} />
            <Datum label="Family" value={report.family ?? "—"} />
            <Datum label="Available sections" value={report.available_sections.join(", ")} />
          </dl>
        </CardContent>
      </Card>

      {populated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Behavior summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {populated.map(([label, items]) => (
              <div key={label}>
                <div
                  className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-fg-2)" }}
                >
                  {label}
                  <span className="ml-1 font-mono" style={{ color: "var(--color-fg-1)" }}>
                    · {items?.length ?? 0}
                  </span>
                </div>
                <ul
                  className="space-y-0.5 font-mono text-[11px]"
                  style={{ color: "var(--color-fg-1)" }}
                >
                  {items?.slice(0, 10).map((item) => (
                    <li key={item} className="truncate" title={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Datum({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-fg-2)" }}
      >
        {label}
      </dt>
      <dd className="font-mono" style={{ color: "var(--color-fg-0)" }}>
        {value}
      </dd>
    </div>
  );
}
