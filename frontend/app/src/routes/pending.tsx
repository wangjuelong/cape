import { StubPage } from "@/components/shared/StubPage";

export default function PendingRoute() {
  return (
    <StubPage
      title="Pending"
      description="Running / pending tasks with live SSE updates."
      todo={[
        "GET /api/v3/tasks/?status=pending,running",
        "EventSource('/api/v3/events/tasks') with credentials",
        "Auto-invalidate task detail queries on task.status events",
      ]}
    />
  );
}
