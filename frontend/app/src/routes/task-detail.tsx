import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, GitCompare, RefreshCw, Trash2 } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AttackTab } from "@/components/report/AttackTab";
import { BehaviorTab } from "@/components/report/BehaviorTab";
import { ConfigTab } from "@/components/report/ConfigTab";
import { DroppedTab } from "@/components/report/DroppedTab";
import { FindingsRail } from "@/components/report/FindingsRail";
import { NetworkTab } from "@/components/report/NetworkTab";
import { PayloadsTab } from "@/components/report/PayloadsTab";
import { ScreenshotsTab } from "@/components/report/ScreenshotsTab";
import { StaticTab } from "@/components/report/StaticTab";
import { SummaryTab } from "@/components/report/SummaryTab";
import { VerdictBanner } from "@/components/report/VerdictBanner";
import { useReportSummary } from "@/hooks/useReport";

interface TabDef {
  key: string;
  label: string;
}

const TABS: TabDef[] = [
  { key: "summary", label: "Summary" },
  { key: "static", label: "Static" },
  { key: "behavior", label: "Behavior" },
  { key: "network", label: "Network" },
  { key: "dropped", label: "Dropped" },
  { key: "screenshots", label: "Screenshots" },
  { key: "payloads", label: "Payloads" },
  { key: "attack", label: "ATT&CK" },
  { key: "config", label: "Config" },
];

export default function TaskDetailRoute() {
  const params = useParams<{ id: string }>();
  const taskId = Number(params.id);
  const summaryQuery = useReportSummary(taskId);
  const [tab, setTab] = useState("summary");
  const [selectedSig, setSelectedSig] = useState<string | null>(null);

  const visibleTabs = useMemo(() => {
    if (!summaryQuery.data) return TABS.filter((t) => t.key === "summary");
    const allowed = new Set(summaryQuery.data.available_sections);
    return TABS.filter((t) => allowed.has(t.key));
  }, [summaryQuery.data]);

  if (summaryQuery.isLoading) {
    return (
      <>
        <PageHead crumbs={["CAPE", "Recent", `Task #${taskId}`]} />
        <div
          className="dim"
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
          }}
        >
          <Spinner size={16} />
          <span style={{ marginLeft: 8 }}>Loading report…</span>
        </div>
      </>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <>
        <PageHead crumbs={["CAPE", "Recent", `Task #${taskId}`]} />
        <div style={{ padding: 16 }}>
          <Alert variant="destructive">
            <AlertTitle>Could not load report</AlertTitle>
            <AlertDescription>
              {(summaryQuery.error as Error | null)?.message ?? "Task not found"}
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  const report = summaryQuery.data;
  const { task, signatures, tab_counts } = report;

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Recent", `Task #${task.id}`]}
        actions={
          <>
            <button type="button" className="btn" disabled title="Coming in P1">
              <GitCompare size={14} />
              <span>Compare</span>
            </button>
            <a
              className="btn"
              href={`/apiv2/tasks/get/report/${task.id}/json/`}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={14} />
              <span>Export</span>
            </a>
            <button type="button" className="btn" disabled title="Coming in P1">
              <RefreshCw size={14} />
              <span>Re-run</span>
            </button>
            <button type="button" className="btn ghost danger" disabled title="Coming in P1">
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </>
        }
      />

      <VerdictBanner task={task} />

      {/* Quick-tab pills — design's `.tabs` strip */}
      <div className="tabs" style={{ paddingLeft: 14, overflowX: "auto" }}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={"tab" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            {tab_counts[t.key] ? <span className="num">{tab_counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      {/* SUMMARY: 3-pane split */}
      {tab === "summary" && (
        <div className="split" style={{ flex: 1, minHeight: 0 }}>
          <FindingsRail signatures={signatures} selected={selectedSig} onSelect={setSelectedSig} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <SummaryTab report={report} />
          </div>
        </div>
      )}

      {tab === "behavior" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <BehaviorTab taskId={task.id} />
        </div>
      )}
      {tab === "static" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <StaticTab taskId={task.id} />
        </div>
      )}
      {tab === "attack" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <AttackTab taskId={task.id} />
        </div>
      )}
      {tab === "config" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ConfigTab taskId={task.id} />
        </div>
      )}
      {tab === "network" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <NetworkTab taskId={task.id} />
        </div>
      )}
      {tab === "dropped" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <DroppedTab taskId={task.id} />
        </div>
      )}
      {tab === "payloads" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <PayloadsTab taskId={task.id} />
        </div>
      )}
      {tab === "screenshots" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ScreenshotsTab taskId={task.id} />
        </div>
      )}
    </>
  );
}
