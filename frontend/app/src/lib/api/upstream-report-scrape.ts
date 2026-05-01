/**
 * Fallback for the task-detail page (`/tasks/<id>`) when the v3 endpoints
 * aren't available. Fetches upstream `/_upstream/analysis/<id>/` HTML once
 * and normalises it into the shape every report hook needs.
 *
 * Upstream Bootstrap report at `/analysis/<id>/` lazily loads several
 * sub-tabs (`behavior`, `dropped`, `payloads`, `screenshots`, `mitre`,
 * `config`) via authenticated POSTs to `/analysis/load_files/<id>/<cat>/`.
 * Those POSTs require a CSRF cookie, which our anonymous scrape can't
 * supply — so for those tabs we mark them as "scrape-mode unavailable"
 * rather than crash the page. The user still gets:
 *
 *   - Verdict banner / task header
 *   - Summary tab (analysis details, machine info, file information)
 *   - Static tab (PE/file metadata)
 *   - Network tab (hosts/dns/tcp/udp/http/suricata sub-cards)
 *
 * which is the bulk of what the live deploy renders inline anyway.
 */

import type {
  AttackReport,
  BehaviorSummary,
  ConfigReport,
  DroppedReport,
  NetworkReport,
  PayloadsReport,
  ReportSummary,
  ScreenshotsReport,
  SignatureLite,
  StaticReport,
} from "./reports";
import type {
  Severity,
  TaskStatus,
  TaskSummary,
  Verdict,
} from "@/types/api";

export interface UpstreamReportScrape {
  task: TaskSummary;
  signatures: SignatureLite[];
  available_sections: string[];
  tab_counts: Record<string, number | string>;
  /** Raw file-info kv table from upstream's "File Information" card. */
  file_info: Record<string, string>;
  /** Network sub-tables — empty arrays when upstream's alert says "No X recorded." */
  network: NetworkReport;
  /** Strings from any inline "Strings" collapse, if rendered. */
  strings: string[];
  behavior_available: boolean;
  dropped_available: boolean;
  payloads_available: boolean;
  screenshots_available: boolean;
  attack_available: boolean;
  config_available: boolean;
}

const cacheByTaskId = new Map<number, Promise<UpstreamReportScrape>>();

export function fetchUpstreamReport(taskId: number): Promise<UpstreamReportScrape> {
  const cached = cacheByTaskId.get(taskId);
  if (cached) return cached;
  const p = (async () => {
    const resp = await fetch(`/_upstream/analysis/${taskId}/`, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });
    if (!resp.ok) {
      throw new Error(`upstream /analysis/${taskId}/ → HTTP ${resp.status}`);
    }
    return parseUpstreamReportHtml(await resp.text(), taskId);
  })();
  cacheByTaskId.set(taskId, p);
  // Drop the cache on failure so the next call retries.
  p.catch(() => cacheByTaskId.delete(taskId));
  return p;
}

export function parseUpstreamReportHtml(
  html: string,
  taskId: number,
): UpstreamReportScrape {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // ---- File Information card (key/value table) ----
  const fileInfo: Record<string, string> = {};
  const fileInfoCard = findCardByTitle(doc, "File Information");
  if (fileInfoCard) {
    for (const tr of fileInfoCard.querySelectorAll("table tr")) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) continue;
      const key = textOf(th).replace(/[:\s]+$/, "");
      // td may contain extra badges/tooltips; pull just the leading text node
      const value = textOf(td).split("\n")[0].trim();
      if (key) fileInfo[key] = value;
    }
  }

  // ---- Analysis Details (single row table) ----
  const analysisDetails: Record<string, string> = {};
  const detailsCard = findCardByTitle(doc, "Analysis Details");
  if (detailsCard) {
    const headerCells = [
      ...detailsCard.querySelectorAll("table thead th"),
    ].map((th) => textOf(th));
    const dataRow = detailsCard.querySelector("table tbody tr");
    const dataCells = dataRow ? [...dataRow.querySelectorAll("td")] : [];
    for (let i = 0; i < headerCells.length && i < dataCells.length; i++) {
      analysisDetails[headerCells[i]] = textOf(dataCells[i]);
    }
  }

  // ---- Machine Information ----
  const machineInfo: Record<string, string> = {};
  const machineCard = findCardByTitle(doc, "Machine Information");
  if (machineCard) {
    for (const tr of machineCard.querySelectorAll("table tr")) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) continue;
      const key = textOf(th).replace(/[:\s]+$/, "");
      const val = textOf(td);
      if (key) machineInfo[key] = val;
    }
  }

  // ---- Tab strip — visible sections ----
  const tabIdToKey: Record<string, string> = {
    "overview-tab": "summary",
    "behavior-tab": "behavior",
    "network-tab": "network",
    "static-tab": "static",
    "dropped-tab": "dropped",
    "payloads-tab": "payloads",
    "screenshots-tab": "screenshots",
    "mitre-tab": "attack",
    "attack-tab": "attack",
    "config-tab": "config",
    "cape-tab": "payloads",
  };
  const visibleTabs = new Set<string>(["summary"]);
  for (const a of doc.querySelectorAll("ul#reportTabs a[id$='-tab']")) {
    const id = a.getAttribute("id") ?? "";
    if (id in tabIdToKey) visibleTabs.add(tabIdToKey[id]);
  }
  // Always treat static (file info) as available since it's rendered inline.
  if (Object.keys(fileInfo).length > 0) visibleTabs.add("static");

  // ---- Behavior availability ----
  const behaviorPanel = doc.querySelector("#behavior");
  const behavior_available =
    !!behaviorPanel &&
    !/No behavioral analysis data/i.test(textOf(behaviorPanel));

  // ---- Dropped / payloads / screenshots / attack / config ----
  // Detect by checking for non-empty card content (not "No X" alert).
  const dropped_available = sectionHasContent(doc, "#dropped");
  const payloads_available = sectionHasContent(doc, "#payloads") || sectionHasContent(doc, "#cape");
  const screenshots_available = sectionHasContent(doc, "#screenshots");
  const attack_available = sectionHasContent(doc, "#mitre") || sectionHasContent(doc, "#attck");
  const config_available = sectionHasContent(doc, "#config");

  // ---- Signatures (Detections Badge Container + behavior summary) ----
  const signatures: SignatureLite[] = [];
  for (const sig of doc.querySelectorAll(".sig-row, .signature-row, .detection-badge")) {
    const name = textOf(sig.querySelector(".sig-name") ?? sig);
    if (name) signatures.push({ name, description: "", severity: 3, ttp: [] });
  }

  // ---- Network sub-tables ----
  const network = parseNetworkSection(doc);

  // ---- Strings (collapse) ----
  const strings: string[] = [];
  for (const collapse of doc.querySelectorAll("[id^='strings_'] pre, .strings-list li")) {
    const txt = textOf(collapse);
    if (txt) strings.push(txt);
  }

  // ---- Build TaskSummary ----
  const md5 = fileInfo["MD5"] || "";
  const sha1 = fileInfo["SHA1"] || "";
  const sha256 = fileInfo["SHA256"]?.split(/\s+/)[0] || "";
  const fileName = fileInfo["File Name"] || "";
  const fileType = fileInfo["File Type"] || "";
  const fileSize = parseSize(fileInfo["File Size"] || "0");
  const machineName = machineInfo["Name"] || machineInfo["Label"] || "";
  const pkgRaw = analysisDetails["Package"] || "";
  const startedRaw = analysisDetails["Started"] || "";
  const completedRaw = analysisDetails["Completed"] || "";
  const durationRaw = analysisDetails["Duration"] || "";
  const categoryRaw = analysisDetails["Category"] || "";

  const task: TaskSummary = {
    id: taskId,
    target: fileName || sha256,
    sha256,
    sha1,
    md5,
    size: fileSize,
    type: fileType,
    submitted: parseTimestamp(startedRaw) ?? "",
    started: parseTimestamp(startedRaw),
    completed: parseTimestamp(completedRaw),
    duration: durationRaw || null,
    machine: machineName || null,
    package: pkgRaw,
    score: 0,
    severity: "clean" as Severity,
    verdict: "clean" as Verdict,
    family: null,
    signatures_count: signatures.length,
    yara_matches: 0,
    network_count:
      network.hosts.length +
      network.domains.length +
      network.tcp.length +
      network.udp.length +
      network.http.length,
    files_dropped: 0,
    payloads: 0,
    api_calls: 0,
    status: categoryRaw ? ("reported" as TaskStatus) : ("completed" as TaskStatus),
    tags: [],
  };

  const tab_counts: Record<string, number | string> = {
    summary: signatures.length,
    static: Object.keys(fileInfo).length,
    network: task.network_count,
  };
  if (behavior_available) tab_counts.behavior = "—";
  if (dropped_available) tab_counts.dropped = "—";
  if (payloads_available) tab_counts.payloads = "—";
  if (screenshots_available) tab_counts.screenshots = "—";
  if (attack_available) tab_counts.attack = "—";
  if (config_available) tab_counts.config = "—";

  return {
    task,
    signatures,
    available_sections: [...visibleTabs],
    tab_counts,
    file_info: fileInfo,
    network,
    strings,
    behavior_available,
    dropped_available,
    payloads_available,
    screenshots_available,
    attack_available,
    config_available,
  };
}

// ---------------------------------------------------------------------------
// Section adapters — map the scrape into each hook's response shape.
// ---------------------------------------------------------------------------

export function asReportSummary(s: UpstreamReportScrape): ReportSummary {
  return {
    task: s.task,
    available_sections: s.available_sections,
    tab_counts: s.tab_counts,
    signatures: s.signatures,
    score: null,
    severity: "clean",
    verdict: "clean",
    family: null,
  };
}

export function asStaticReport(s: UpstreamReportScrape): StaticReport {
  return {
    static: {},
    target_file: s.file_info as unknown as Record<string, unknown>,
  };
}

export function asNetworkReport(s: UpstreamReportScrape): NetworkReport {
  return s.network;
}

export function asBehaviorReport(_s: UpstreamReportScrape): BehaviorSummary {
  // Behavior is lazy-loaded upstream — return an empty shell.
  return {
    platform: null,
    processtree: [],
    processes: [],
  };
}

export function asDroppedReport(_s: UpstreamReportScrape): DroppedReport {
  return { dropped: [] };
}

export function asPayloadsReport(_s: UpstreamReportScrape): PayloadsReport {
  return { payloads: [] };
}

export function asScreenshotsReport(_s: UpstreamReportScrape): ScreenshotsReport {
  return { count: 0, shots: [] };
}

export function asAttackReport(_s: UpstreamReportScrape): AttackReport {
  return { ttps: [], mitre_attck: [] };
}

export function asConfigReport(_s: UpstreamReportScrape): ConfigReport {
  return { malware_conf: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCardByTitle(doc: Document, titleText: string): Element | null {
  for (const card of doc.querySelectorAll(".card")) {
    const h5 = card.querySelector(".card-header h5");
    if (h5 && (h5.textContent || "").trim().includes(titleText)) {
      return card;
    }
  }
  return null;
}

function sectionHasContent(doc: Document, selector: string): boolean {
  const el = doc.querySelector(selector);
  if (!el) return false;
  const txt = textOf(el);
  // Detect explicit "No X" alerts upstream renders for empty sections.
  if (/^\s*$/.test(txt)) return false;
  if (
    /No (behavioral analysis|tracee|strace|hosts|TCP|UDP|DNS|HTTP|SMTP|IRC|ICMP|CIF|payloads|dropped|screenshots|configuration|attack|MITRE)/i.test(
      txt,
    )
  ) {
    return false;
  }
  // Look for either a table with rows or a list with items
  if (el.querySelector("table tbody tr")) return true;
  if (el.querySelector("ul li")) return true;
  if (el.querySelector(".card-body")) return true;
  return false;
}

function parseNetworkSection(doc: Document): NetworkReport {
  const network: NetworkReport = {
    hosts: [],
    domains: [],
    tcp: [],
    udp: [],
    icmp: [],
    smtp: [],
    irc: [],
    http: [],
    suricata: { alerts: [], tls: [], http: [], files: [] },
  };

  // Each network subsection is a card with a known title. Pull rows.
  pullRowsByTitle(doc, "Hosts", network.hosts);
  pullRowsByTitle(doc, "DNS Requests", network.domains);
  pullRowsByTitle(doc, "TCP Connections", network.tcp);
  pullRowsByTitle(doc, "UDP Connections", network.udp);
  pullRowsByTitle(doc, "HTTP Requests", network.http);
  pullRowsByTitle(doc, "SMTP Traffic", network.smtp);
  pullRowsByTitle(doc, "IRC Traffic", network.irc);
  pullRowsByTitle(doc, "ICMP Traffic", network.icmp);
  pullRowsByTitle(doc, "Suricata Alerts", network.suricata.alerts);
  pullRowsByTitle(doc, "Suricata TLS", network.suricata.tls);
  pullRowsByTitle(doc, "Suricata HTTP", network.suricata.http);

  return network;
}

function pullRowsByTitle(doc: Document, titleText: string, into: unknown[]) {
  const card = findCardByTitle(doc, titleText);
  if (!card) return;
  // Skip empty-state alerts.
  const alert = card.querySelector(".card-body .alert, .alert-info");
  if (alert && /No /i.test((alert.textContent || "").trim())) return;
  const headers = [...card.querySelectorAll("table thead th")].map((th) =>
    textOf(th).toLowerCase().replace(/\W+/g, "_"),
  );
  for (const tr of card.querySelectorAll("table tbody tr")) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length === 0) continue;
    const row: Record<string, string> = {};
    tds.forEach((td, i) => {
      const k = headers[i] || `col_${i}`;
      row[k] = textOf(td);
    });
    into.push(row);
  }
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function parseSize(s: string): number {
  if (!s) return 0;
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function parseTimestamp(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!m) return s;
  return `${m[1]}T${m[2]}Z`;
}
