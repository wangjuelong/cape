import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, GitCompare, RefreshCw, Trash2 } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BehaviorTab } from "@/components/report/BehaviorTab";
import { FindingsRail } from "@/components/report/FindingsRail";
import { SummaryTab } from "@/components/report/SummaryTab";
import { VerdictBanner } from "@/components/report/VerdictBanner";
import { useReportSummary } from "@/hooks/useReport";

const TABS: Array<{ key: string; label: string }> = [
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
          className="flex flex-1 items-center justify-center text-xs"
          style={{ color: "var(--color-fg-2)" }}
        >
          <Spinner size={16} />
          <span className="ml-2">Loading report…</span>
        </div>
      </>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <>
        <PageHead crumbs={["CAPE", "Recent", `Task #${taskId}`]} />
        <div className="p-4">
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
            <Button variant="secondary" size="sm" disabled title="Coming in P1">
              <GitCompare size={12} />
              Compare
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={`/apiv2/tasks/get/report/${task.id}/json/`} target="_blank" rel="noreferrer">
                <Download size={12} />
                Export
              </a>
            </Button>
            <Button variant="secondary" size="sm" disabled title="Coming in P1">
              <RefreshCw size={12} />
              Re-run
            </Button>
            <Button variant="destructive" size="sm" disabled title="Coming in P1">
              <Trash2 size={12} />
              Delete
            </Button>
          </>
        }
      />

      <VerdictBanner task={task} />

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {tab_counts[t.key] ? (
                <span className="font-mono text-[10px] opacity-60">{tab_counts[t.key]}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" className="flex flex-1 overflow-hidden">
          <FindingsRail signatures={signatures} selected={selectedSig} onSelect={setSelectedSig} />
          <main className="flex-1 overflow-auto">
            <SummaryTab report={report} />
          </main>
        </TabsContent>

        <TabsContent value="behavior" className="flex flex-1 overflow-hidden">
          <BehaviorTab taskId={task.id} />
        </TabsContent>

        {visibleTabs
          .filter((t) => t.key !== "summary" && t.key !== "behavior")
          .map((t) => (
            <TabsContent
              key={t.key}
              value={t.key}
              className="flex flex-1 items-center justify-center p-8"
            >
              <div className="text-center text-xs" style={{ color: "var(--color-fg-2)" }}>
                <div
                  className="mb-1 font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-fg-1)" }}
                >
                  {t.label} tab — pending
                </div>
                Tab content lands incrementally during PRD §8 阶段 3 W9–W14.
                <br />
                See <code>docs/prd/report-page-spec.md</code> for the implementation order.
              </div>
            </TabsContent>
          ))}
      </Tabs>
    </>
  );
}
