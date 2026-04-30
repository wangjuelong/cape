import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useReportConfig } from "@/hooks/useReportTabs";

import { JsonViewer } from "./JsonView";

interface ConfigTabProps {
  taskId: number;
}

export function ConfigTab({ taskId }: ConfigTabProps) {
  const query = useReportConfig(taskId);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading malware config…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No CAPE configuration extracted</AlertTitle>
          <AlertDescription>
            CAPE did not extract a malware configuration for this task. The Config tab is only
            populated for samples whose family has a matching extractor.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const blocks = query.data?.malware_conf ?? [];

  if (blocks.length === 0) {
    return (
      <Centered>No malware configuration extracted.</Centered>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-auto p-4">
      {blocks.map((block, i) => (
        <ConfigBlock key={i} block={block} />
      ))}
    </div>
  );
}

function ConfigBlock({ block }: { block: unknown }) {
  if (typeof block !== "object" || block === null) {
    return <JsonViewer data={block} />;
  }
  // Each block is typically `{family_name: {...config}}` plus a few
  // `_associated_*` audit keys.
  const entries = Object.entries(block as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("_"),
  );
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([family, cfg]) => (
        <Card key={family}>
          <CardHeader>
            <CardTitle>{family}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={cfg} collapseAtDepth={3} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center p-4 text-xs"
      style={{ color: "var(--color-fg-2)" }}
    >
      {children}
    </div>
  );
}
