import { StubPage } from "@/components/shared/StubPage";

export default function DocsRoute() {
  return (
    <StubPage
      title="API Docs"
      crumbs={["CAPE", "Admin", "API Docs"]}
      description="Embedded Swagger UI consuming the drf-spectacular schema at /api/v3/schema/."
      todo={[
        "Mount swagger-ui-react with url=/api/v3/schema/",
        "Set deep-link enabled for /docs#/<tag>/<operationId>",
      ]}
    />
  );
}
