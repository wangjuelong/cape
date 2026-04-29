import { StubPage } from "@/components/shared/StubPage";

export default function SearchRoute() {
  return (
    <StubPage
      title="Search"
      description="Cross-field extended search (hash, family, IP, signature, yara, ATT&CK technique, ...)."
      todo={[
        "POST /api/v3/tasks/search/ with structured filter payload",
        "Field selector matching ext_tasks_search options",
      ]}
    />
  );
}
