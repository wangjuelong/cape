import { StubPage } from "@/components/shared/StubPage";

export default function DashboardRoute() {
  return (
    <StubPage
      title="Dashboard"
      description="Today's submissions, top families, machine utilization, alert feed."
      todo={[
        "GET /api/v3/dashboard/summary/",
        "GET /api/v3/dashboard/trends/?window=7d",
        "Recharts bar/line widgets",
      ]}
    />
  );
}
