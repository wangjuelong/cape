import { StubPage } from "@/components/shared/StubPage";

export default function StatsRoute() {
  return (
    <StubPage
      title="Statistics"
      description="Per-day / per-hour task counts, family distributions, machine load."
      todo={[
        "GET /api/v3/dashboard/trends/?window=7d|30d",
        "Recharts area / bar / heatmap variants",
      ]}
    />
  );
}
