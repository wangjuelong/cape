import { StubPage } from "@/components/shared/StubPage";

export default function MachinesRoute() {
  return (
    <StubPage
      title="Machines"
      crumbs={["CAPE", "Admin", "Machines"]}
      description="Registered VMs, current task per machine, health, and tags."
      todo={[
        "GET /api/v3/machines/",
        "GET /api/v3/machines/<name>/",
        "Live machine.status events via SSE",
      ]}
    />
  );
}
