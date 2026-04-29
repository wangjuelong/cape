import { StubPage } from "@/components/shared/StubPage";

export default function AuditRoute() {
  return (
    <StubPage
      title="Audit"
      crumbs={["CAPE", "Admin", "Audit"]}
      description="Audit log of user actions (delete, reschedule, comment, ...)."
      todo={[
        "GET /api/v3/audits/?cursor=...",
        "GET /api/v3/audits/<id>/",
        "Filter by user / action / target",
      ]}
    />
  );
}
