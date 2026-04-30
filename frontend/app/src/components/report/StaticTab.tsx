import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useReportStatic } from "@/hooks/useReportTabs";

import { JsonViewer } from "./JsonView";

interface StaticTabProps {
  taskId: number;
}

export function StaticTab({ taskId }: StaticTabProps) {
  const query = useReportStatic(taskId);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading static analysis…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No static analysis</AlertTitle>
          <AlertDescription>
            CAPE has not produced static analysis output for this task. This is normal for URL,
            PCAP, or pending tasks.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = query.data;
  if (!data) return <Centered>No data.</Centered>;

  const staticHasContent = data.static && Object.keys(data.static).length > 0;
  const fileHasContent = data.target_file && Object.keys(data.target_file).length > 0;

  return (
    <div className="space-y-3 overflow-auto p-4">
      {fileHasContent && (
        <Card>
          <CardHeader>
            <CardTitle>Target file</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={data.target_file} collapseAtDepth={2} />
          </CardContent>
        </Card>
      )}
      {staticHasContent && (
        <Card>
          <CardHeader>
            <CardTitle>Static parsers</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={data.static} collapseAtDepth={1} />
          </CardContent>
        </Card>
      )}
      {!staticHasContent && !fileHasContent && (
        <Centered>No static analysis output for this task.</Centered>
      )}
    </div>
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
