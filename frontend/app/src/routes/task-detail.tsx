import { useParams } from "react-router-dom";

import { StubPage } from "@/components/shared/StubPage";

export default function TaskDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return (
    <StubPage
      title={`Task #${id}`}
      crumbs={["CAPE", "Recent", `Task #${id ?? "?"}`]}
      description="Analysis report with 9 tabs: Summary / Static / Behavior / Network / Dropped / Screenshots / Payloads / ATT&CK / Config."
      todo={[
        "GET /api/v3/reports/<id>/summary/ for verdict banner + tab counts",
        "Lazy-load each tab via /api/v3/reports/<id>/<tab>/",
        "VerdictBanner + ScoreBadge + SignatureRail components",
        "BehaviorTab uses React Flow + dagre layout for the process tree",
        "NetworkTab combines React Flow topology with Recharts time series",
        "AttackTab renders a CSS grid matrix; ConfigTab uses react-json-view-lite",
      ]}
    />
  );
}
