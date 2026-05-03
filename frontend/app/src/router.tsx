import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { Shell } from "@/components/shell/Shell";

const DashboardRoute = lazy(() => import("@/routes/dashboard"));
const SubmitRoute = lazy(() => import("@/routes/submit"));
const RecentRoute = lazy(() => import("@/routes/recent"));
const PendingRoute = lazy(() => import("@/routes/pending"));
const SearchRoute = lazy(() => import("@/routes/search"));
const CompareRoute = lazy(() => import("@/routes/compare"));
const ConfigsRoute = lazy(() => import("@/routes/configs"));
const StatsRoute = lazy(() => import("@/routes/stats"));
const MachinesRoute = lazy(() => import("@/routes/machines"));
const AuditRoute = lazy(() => import("@/routes/audit"));
const UsersRoute = lazy(() => import("@/routes/users"));
const UsersNewRoute = lazy(() => import("@/routes/users-new"));
const UsersDetailRoute = lazy(() => import("@/routes/users-detail"));
const GroupsRoute = lazy(() => import("@/routes/groups"));
const GroupsNewRoute = lazy(() => import("@/routes/groups-new"));
const DocsRoute = lazy(() => import("@/routes/docs"));
const TaskDetailRoute = lazy(() => import("@/routes/task-detail"));
const LoginBridgeRoute = lazy(() => import("@/routes/login-bridge"));
const NotFoundRoute = lazy(() => import("@/routes/not-found"));

function withSuspense(node: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <div
          className="dim mono"
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
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
      // Dashboard lives at the root path. The legacy /dashboard child
      // route is kept as an alias for old bookmarks (it just renders the
      // same component) so deep links still work — but new navigation
      // goes through `/`.
      { index: true, element: withSuspense(<DashboardRoute />) },
      { path: "dashboard", element: <Navigate to="/" replace /> },
      { path: "submit", element: withSuspense(<SubmitRoute />) },
      {
        path: "submit/resubmit/:task_id/:hash",
        element: withSuspense(<SubmitRoute />),
      },
      { path: "recent", element: withSuspense(<RecentRoute />) },
      { path: "pending", element: withSuspense(<PendingRoute />) },
      { path: "search", element: withSuspense(<SearchRoute />) },
      { path: "compare", element: withSuspense(<CompareRoute />) },
      { path: "compare/:left", element: withSuspense(<CompareRoute />) },
      { path: "compare/:left/:right", element: withSuspense(<CompareRoute />) },
      { path: "configs", element: withSuspense(<ConfigsRoute />) },
      { path: "stats", element: <Navigate to="/stats/7" replace /> },
      { path: "stats/:days", element: withSuspense(<StatsRoute />) },
      { path: "machines", element: withSuspense(<MachinesRoute />) },
      { path: "audit", element: withSuspense(<AuditRoute />) },
      { path: "users", element: withSuspense(<UsersRoute />) },
      { path: "users/new", element: withSuspense(<UsersNewRoute />) },
      { path: "users/:id", element: withSuspense(<UsersDetailRoute />) },
      { path: "groups", element: withSuspense(<GroupsRoute />) },
      { path: "groups/new", element: withSuspense(<GroupsNewRoute />) },
      { path: "docs", element: withSuspense(<DocsRoute />) },
      { path: "tasks/:id", element: withSuspense(<TaskDetailRoute />) },
      { path: "*", element: withSuspense(<NotFoundRoute />) },
    ],
  },
  { path: "/login-bridge", element: withSuspense(<LoginBridgeRoute />) },
]);
