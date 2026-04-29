import { StubPage } from "@/components/shared/StubPage";

export default function RecentRoute() {
  return (
    <StubPage
      title="Recent"
      description="Reported task list with TanStack Table — sortable, filterable, paginated."
      todo={[
        "GET /api/v3/tasks/?status=reported&cursor=...",
        "TanStack Table with column visibility, multi-sort, sticky header",
        "URL-state for filters/sort (sharable links)",
      ]}
    />
  );
}
