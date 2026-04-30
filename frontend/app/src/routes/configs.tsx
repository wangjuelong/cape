import { StubPage } from "@/components/shared/StubPage";

export default function ConfigsRoute() {
  return (
    <StubPage
      title="Extracted configurations"
      description="Aggregated view of CAPE-extracted malware configs (Qakbot/IcedID/Emotet/etc.). Pivot from any config back to the task that produced it."
      todo={[
        "GET /api/v3/configs/?family=&since=&page=",
        "Per-family stat tiles + table",
        "Wire to upstream `cape/parsers/CAPE/` extractors",
      ]}
    />
  );
}
