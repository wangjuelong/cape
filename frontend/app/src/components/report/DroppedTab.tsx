import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useReportDropped } from "@/hooks/useReportTabs";

import { JsonViewer } from "./JsonView";

interface DroppedTabProps {
  taskId: number;
}

interface DroppedFile {
  name?: string;
  filepath?: string;
  size?: number;
  type?: string;
  sha256?: string;
  md5?: string;
  yara?: unknown[];
  cape_yara?: unknown[];
}

export function DroppedTab({ taskId }: DroppedTabProps) {
  const query = useReportDropped(taskId);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading dropped files…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No dropped files</AlertTitle>
          <AlertDescription>
            The sample did not drop any files inside the guest, or analysis is still in progress.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const items = (query.data?.dropped ?? []) as DroppedFile[];
  if (items.length === 0) {
    return <Centered>No dropped files.</Centered>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <table className="w-full text-[11px]">
        <thead
          className="sticky top-0"
          style={{
            background: "var(--color-bg-1)",
            color: "var(--color-fg-2)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <tr>
            <th className="px-3 py-1 text-left">name</th>
            <th className="px-3 py-1 text-left">type</th>
            <th className="px-3 py-1 text-right">size</th>
            <th className="px-3 py-1 text-left">sha256</th>
            <th className="px-3 py-1 text-left">yara</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f, i) => (
            <tr
              key={f.sha256 ?? i}
              className="border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-0)" }}>
                {f.name ?? f.filepath ?? "(unnamed)"}
              </td>
              <td className="px-3 py-1" style={{ color: "var(--color-fg-1)" }}>
                {f.type ?? ""}
              </td>
              <td className="px-3 py-1 text-right font-mono" style={{ color: "var(--color-fg-2)" }}>
                {f.size ?? ""}
              </td>
              <td
                className="max-w-[260px] truncate px-3 py-1 font-mono"
                style={{ color: "var(--color-fg-2)" }}
                title={f.sha256 ?? ""}
              >
                {f.sha256 ?? ""}
              </td>
              <td className="px-3 py-1" style={{ color: "var(--color-fg-1)" }}>
                {(f.yara ?? []).length + (f.cape_yara ?? []).length || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mt-3 border-t p-3" style={{ borderColor: "var(--color-border)" }}>
        <summary className="cursor-pointer text-xs" style={{ color: "var(--color-fg-2)" }}>
          Raw JSON
        </summary>
        <div className="mt-2">
          <JsonViewer data={items} collapseAtDepth={1} />
        </div>
      </details>
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
