import { StubPage } from "@/components/shared/StubPage";

export default function CompareRoute() {
  return (
    <StubPage
      title="Compare"
      description="Side-by-side diff of two analyses (network, signatures, TTPs)."
      todo={[
        "POST /api/v3/compare/ with body { task_ids: [a, b] }",
        "Diff visualization for signature presence, network IOCs, TTP mapping",
      ]}
    />
  );
}
