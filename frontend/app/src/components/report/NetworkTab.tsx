import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useReportNetwork } from "@/hooks/useReportTabs";
import type { NetworkReport } from "@/lib/api/reports";

import { JsonViewer } from "./JsonView";

interface NetworkTabProps {
  taskId: number;
}

type SubKey =
  | "hosts"
  | "domains"
  | "tcp"
  | "udp"
  | "http"
  | "smtp"
  | "irc"
  | "icmp"
  | "suricata-alerts"
  | "suricata-tls"
  | "suricata-http"
  | "suricata-files";

const SUBS: Array<{ key: SubKey; label: string }> = [
  { key: "hosts", label: "Hosts" },
  { key: "domains", label: "DNS" },
  { key: "tcp", label: "TCP" },
  { key: "udp", label: "UDP" },
  { key: "http", label: "HTTP" },
  { key: "smtp", label: "SMTP" },
  { key: "irc", label: "IRC" },
  { key: "icmp", label: "ICMP" },
  { key: "suricata-alerts", label: "Suricata: Alerts" },
  { key: "suricata-tls", label: "Suricata: TLS" },
  { key: "suricata-http", label: "Suricata: HTTP" },
  { key: "suricata-files", label: "Suricata: Files" },
];

function pick(report: NetworkReport, key: SubKey): unknown[] {
  switch (key) {
    case "hosts":
      return report.hosts;
    case "domains":
      return report.domains;
    case "tcp":
      return report.tcp;
    case "udp":
      return report.udp;
    case "http":
      return report.http;
    case "smtp":
      return report.smtp;
    case "irc":
      return report.irc;
    case "icmp":
      return report.icmp;
    case "suricata-alerts":
      return report.suricata.alerts;
    case "suricata-tls":
      return report.suricata.tls;
    case "suricata-http":
      return report.suricata.http;
    case "suricata-files":
      return report.suricata.files;
  }
}

export function NetworkTab({ taskId }: NetworkTabProps) {
  const query = useReportNetwork(taskId);
  const [active, setActive] = useState<SubKey>("hosts");

  const counts = useMemo(() => {
    if (!query.data) return {} as Record<SubKey, number>;
    return Object.fromEntries(
      SUBS.map(({ key }) => [key, pick(query.data!, key).length]),
    ) as Record<SubKey, number>;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
        <span className="ml-2">Loading network data…</span>
      </Centered>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="info">
          <AlertTitle>No network data</AlertTitle>
          <AlertDescription>
            Either no PCAP was captured for this task or analysis is still in progress.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const visible = SUBS.filter(({ key }) => (counts[key] ?? 0) > 0);
  const showSubs = visible.length > 0 ? visible : SUBS.slice(0, 2); // hosts/domains placeholder

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={active}
        onValueChange={(v) => setActive(v as SubKey)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList>
          {showSubs.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>
              {label}
              {counts[key] ? (
                <span className="font-mono text-[10px] opacity-60">{counts[key]}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {showSubs.map(({ key }) => (
          <TabsContent key={key} value={key} className="flex flex-1 overflow-auto p-4">
            {(counts[key] ?? 0) === 0 ? (
              <Centered>No {key} entries.</Centered>
            ) : (
              <ItemList items={pick(query.data!, key)} kind={key} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface ItemListProps {
  items: unknown[];
  kind: SubKey;
}

function ItemList({ items, kind }: ItemListProps) {
  // Most network items are simple {ip,port}/{request,host}-like dicts.
  // Render them as a compact table when the first item is a flat dict;
  // otherwise fall back to JsonViewer.
  const first = items[0];
  const isFlat =
    typeof first === "object" &&
    first !== null &&
    Object.values(first as Record<string, unknown>).every(
      (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
    );

  if (!isFlat) {
    return <JsonViewer data={items} collapseAtDepth={kind === "hosts" ? 2 : 1} />;
  }

  const cols = Object.keys(first as Record<string, unknown>);
  return (
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
          {cols.map((c) => (
            <th key={c} className="px-3 py-1 text-left font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(items as Array<Record<string, unknown>>).map((row, i) => (
          <tr key={i} className="border-b" style={{ borderColor: "var(--color-border)" }}>
            {cols.map((c) => (
              <td
                key={c}
                className="max-w-md truncate px-3 py-1 font-mono"
                style={{ color: "var(--color-fg-1)" }}
                title={String(row[c] ?? "")}
              >
                {String(row[c] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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

// Suppress unused-import warnings from re-exports above; the Badge will
// be needed once we add severity colouring on Suricata alerts.
void Badge;
