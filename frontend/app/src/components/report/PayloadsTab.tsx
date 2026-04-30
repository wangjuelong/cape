import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useReportPayloads } from "@/hooks/useReportTabs";

import { JsonViewer } from "./JsonView";

interface PayloadsTabProps {
  taskId: number;
}

interface Payload {
  name?: string;
  type?: string;
  size?: number;
  sha256?: string;
  cape_type?: string;
  cape_yara?: Array<{ name?: string }>;
  process_path?: string;
  process_name?: string;
  pid?: number;
}

export function PayloadsTab({ taskId }: PayloadsTabProps) {
  const query = useReportPayloads(taskId);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading CAPE payloads…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No CAPE payloads</AlertTitle>
          <AlertDescription>
            CAPE has not unpacked any payload from this sample yet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const items = (query.data?.payloads ?? []) as Payload[];
  if (items.length === 0) return <Centered>No payloads recorded.</Centered>;

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
            <th className="px-3 py-1 text-left">cape_type</th>
            <th className="px-3 py-1 text-right">size</th>
            <th className="px-3 py-1 text-left">parent</th>
            <th className="px-3 py-1 text-left">yara</th>
            <th className="px-3 py-1 text-left">sha256</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr
              key={p.sha256 ?? i}
              className="border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-0)" }}>
                {p.name ?? "(unnamed)"}
              </td>
              <td className="px-3 py-1">
                {p.cape_type ? <Badge variant="crit">{p.cape_type}</Badge> : ""}
              </td>
              <td
                className="px-3 py-1 text-right font-mono"
                style={{ color: "var(--color-fg-2)" }}
              >
                {p.size ?? ""}
              </td>
              <td className="px-3 py-1 font-mono" style={{ color: "var(--color-fg-1)" }}>
                {p.process_name ? `${p.process_name} (${p.pid ?? "?"})` : ""}
              </td>
              <td className="px-3 py-1" style={{ color: "var(--color-fg-1)" }}>
                {(p.cape_yara ?? []).map((y) => y.name).filter(Boolean).join(", ")}
              </td>
              <td
                className="max-w-[260px] truncate px-3 py-1 font-mono"
                style={{ color: "var(--color-fg-2)" }}
                title={p.sha256 ?? ""}
              >
                {p.sha256 ?? ""}
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
