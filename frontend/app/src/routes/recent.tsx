import { useEffect, useMemo, useState } from "react";
import { Files, FileCode, Network, RefreshCw, Upload } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LiveIndicator } from "@/components/recent/LiveIndicator";
import { AnalysisCategoryTable } from "@/components/recent/AnalysisCategoryTable";
import { useTaskList } from "@/hooks/useTaskList";
import { useTaskEvents } from "@/hooks/useTaskEvents";
import type { TaskListFilters } from "@/types/api";

/**
 * Recent analyses — mirrors upstream `web/templates/analysis/index.html`.
 *
 * Four sub-tabs (Files / Static / URLs / PCAPs), each a separate
 * `db.list_tasks(category=…, not_status=pending)` query. The active tab
 * is persisted in localStorage so the user lands on the same view on
 * refresh, matching upstream's `localStorage.lastTab` JS.
 *
 * Visual style stays in the SOC dark design system (panel + table.data).
 */

type AnalysisTab = "files" | "static" | "pcaps";

const TABS: Array<{
  key: AnalysisTab;
  label: string;
  category: "file" | "static" | "pcap";
  icon: React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyText: string;
}> = [
  // URL submissions removed from Submit page (see commit 0ca6d738), so
  // there's no path for new URL tasks to land in Recent. The legacy "URLs"
  // sub-tab is removed here too — it would only ever show stale historical
  // entries and confuse users. Backend `category=url` task records still
  // exist for /apiv2/ token clients and are still queryable through
  // /api/v3/tasks/?category=url, the SPA simply doesn't expose a tab.
  {
    key: "files",
    label: "Files",
    category: "file",
    icon: <Files size={14} />,
    emptyIcon: <Files size={36} />,
    emptyText: "No file analyses to display on this page.",
  },
  {
    key: "static",
    label: "Static",
    category: "static",
    icon: <FileCode size={14} />,
    emptyIcon: <FileCode size={36} />,
    emptyText: "No static analyses to display on this page.",
  },
  {
    key: "pcaps",
    label: "PCAPs",
    category: "pcap",
    icon: <Network size={14} />,
    emptyIcon: <Network size={36} />,
    emptyText: "No PCAPs to display on this page.",
  },
];

const TAB_STORAGE_KEY = "cape.recent.tab";

export default function RecentRoute() {
  // All three remaining tabs (Files/Static/PCAPs) are always shown — the
  // old `{% if config.url_analysis %}` upstream gate was specific to the
  // URLs tab, which is no longer rendered.
  const visibleTabs = TABS;

  const [activeTab, setActiveTab] = useState<AnalysisTab>(() => {
    if (typeof window === "undefined") return "files";
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as AnalysisTab | null;
    return saved && TABS.some((t) => t.key === saved) ? saved : "files";
  });

  // Mirror upstream's localStorage.setItem('lastTab', ...)
  useEffect(() => {
    window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  // Drop saved tab if it became hidden (e.g. URLs tab disabled after restart)
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key ?? "files");
    }
  }, [visibleTabs, activeTab]);

  const tabDef = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0] ?? TABS[0];

  // Upstream excludes pending tasks from each Recent listing — match that.
  const filters = useMemo<TaskListFilters>(
    () => ({
      category: tabDef.category,
      limit: 50,
    }),
    [tabDef.category],
  );

  const query = useTaskList(filters);
  const { connected } = useTaskEvents();
  // Visible items = everything except status="pending" (mirrors upstream
  // `not_status=TASK_PENDING`).
  const items = useMemo(() => query.tasks.filter((t) => t.status !== "pending"), [query.tasks]);

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Recent analyses"]}
        actions={
          <>
            <LiveIndicator connected={connected} />
            <button
              type="button"
              className="btn"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <a className="btn primary" href="/submit">
              <Upload size={14} />
              <span>New analysis</span>
            </a>
          </>
        }
      />

      {/* Sub-tab strip — same look as the report page tabs (.tabs / .tab) */}
      <div className="tabs" style={{ paddingLeft: 14 }}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            data-state={activeTab === t.key ? "active" : "inactive"}
            className={"tab" + (activeTab === t.key ? " active" : "")}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ padding: 14 }}>
          <div className="panel">
            <div className="panel-h">
              Recent {tabDef.label}
              <span className="count">
                · {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              <div className="actions">{query.isFetching && <Spinner size={12} />}</div>
            </div>

            {query.isError && (
              <div style={{ padding: 12 }}>
                <Alert variant="destructive">
                  <AlertTitle>Failed to load tasks</AlertTitle>
                  <AlertDescription>{(query.error as Error).message}</AlertDescription>
                </Alert>
              </div>
            )}

            <AnalysisCategoryTable
              data={items}
              category={tabDef.category}
              emptyIcon={tabDef.emptyIcon}
              emptyText={tabDef.emptyText}
            />
          </div>

          {query.hasNextPage && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="btn"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? <Spinner size={12} /> : null}
                <span>Load more</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
