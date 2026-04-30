import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useReportAttack } from "@/hooks/useReportTabs";

import { JsonViewer } from "./JsonView";

interface AttackTabProps {
  taskId: number;
}

interface TacticBlock {
  id?: string;
  name?: string;
  techniques?: TechniqueBlock[];
}
interface TechniqueBlock {
  id?: string;
  name?: string;
  matched?: boolean;
  hits?: number;
  signatures?: string[];
  subtechniques?: TechniqueBlock[];
}

export function AttackTab({ taskId }: AttackTabProps) {
  const query = useReportAttack(taskId);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading ATT&CK mapping…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No ATT&CK mapping</AlertTitle>
          <AlertDescription>
            No TTP data has been written for this task — usually because reporting is still in
            progress or no signature with TTP annotations matched.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = query.data;
  if (!data) return <Centered>No data.</Centered>;

  // mapTTPs.py output shape varies. We normalise to a flat tactic list
  // when possible; otherwise fall back to a JSON tree.
  const tactics = normalise(data.mitre_attck);

  return (
    <div className="flex-1 space-y-3 overflow-auto p-4">
      {tactics.length > 0 ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {tactics.map((tactic) => (
            <TacticColumn key={tactic.id ?? tactic.name} tactic={tactic} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-md border p-3"
          style={{ background: "var(--color-bg-1)", borderColor: "var(--color-border)" }}
        >
          <div className="mb-2 text-xs font-semibold" style={{ color: "var(--color-fg-0)" }}>
            Raw TTPs
          </div>
          <JsonViewer
            data={
              data.mitre_attck.length > 0
                ? data.mitre_attck
                : data.ttps.length > 0
                  ? data.ttps
                  : { ttps: data.ttps, mitre_attck: data.mitre_attck }
            }
            collapseAtDepth={1}
          />
        </div>
      )}
    </div>
  );
}

function TacticColumn({ tactic }: { tactic: TacticBlock }) {
  const techniques = tactic.techniques ?? [];
  return (
    <div
      className="rounded-md border"
      style={{ background: "var(--color-bg-1)", borderColor: "var(--color-border)" }}
    >
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="text-[11px] font-semibold" style={{ color: "var(--color-fg-0)" }}>
          {tactic.name ?? tactic.id}
        </div>
        {tactic.id && tactic.id !== tactic.name && (
          <div className="font-mono text-[10px]" style={{ color: "var(--color-fg-2)" }}>
            {tactic.id}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {techniques.length === 0 ? (
          <span className="text-[10px]" style={{ color: "var(--color-fg-2)" }}>
            no techniques
          </span>
        ) : (
          techniques.map((t) => (
            <div
              key={t.id ?? t.name}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: t.matched
                  ? "color-mix(in oklch, var(--color-sev-crit) 15%, transparent)"
                  : "var(--color-bg-2)",
                color: "var(--color-fg-0)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{t.id ?? t.name}</span>
                {t.hits !== undefined && t.hits > 0 && (
                  <Badge variant={t.matched ? "crit" : "outline"}>{t.hits}</Badge>
                )}
              </div>
              {t.name && t.id !== t.name && (
                <div className="truncate" style={{ color: "var(--color-fg-1)" }}>
                  {t.name}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function normalise(raw: unknown[]): TacticBlock[] {
  if (!Array.isArray(raw)) return [];
  // mitre_attck typically: [{id, name, techniques: [...]}]
  if (raw.length === 0) return [];
  const sample = raw[0];
  if (typeof sample === "object" && sample !== null && "techniques" in sample) {
    return raw as TacticBlock[];
  }
  return [];
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
