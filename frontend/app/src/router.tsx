import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { Shell } from "@/components/shell/Shell";

const DashboardRoute = lazy(() => import("@/routes/dashboard"));
const SubmitRoute = lazy(() => import("@/routes/submit"));
const RecentRoute = lazy(() => import("@/routes/recent"));
const PendingRoute = lazy(() => import("@/routes/pending"));
const SearchRoute = lazy(() => import("@/routes/search"));
const CompareRoute = lazy(() => import("@/routes/compare"));
const StatsRoute = lazy(() => import("@/routes/stats"));
const MachinesRoute = lazy(() => import("@/routes/machines"));
const AuditRoute = lazy(() => import("@/routes/audit"));
const DocsRoute = lazy(() => import("@/routes/docs"));
const TaskDetailRoute = lazy(() => import("@/routes/task-detail"));
const LoginBridgeRoute = lazy(() => import("@/routes/login-bridge"));

function withSuspense(node: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <div
          className="grid h-full place-items-center text-xs"
          style={{ color: "var(--color-fg-2)" }}
        >
          Loading…
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: withSuspense(<DashboardRoute />) },
      { path: "submit", element: withSuspense(<SubmitRoute />) },
      { path: "recent", element: withSuspense(<RecentRoute />) },
      { path: "pending", element: withSuspense(<PendingRoute />) },
      { path: "search", element: withSuspense(<SearchRoute />) },
      { path: "compare", element: withSuspense(<CompareRoute />) },
      { path: "stats", element: withSuspense(<StatsRoute />) },
      { path: "machines", element: withSuspense(<MachinesRoute />) },
      { path: "audit", element: withSuspense(<AuditRoute />) },
      { path: "docs", element: withSuspense(<DocsRoute />) },
      { path: "tasks/:id", element: withSuspense(<TaskDetailRoute />) },
    ],
  },
  { path: "/login-bridge", element: withSuspense(<LoginBridgeRoute />) },
]);
