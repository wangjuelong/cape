/**
 * Fallback for the Recent page when our v3 endpoints aren't available —
 * fetches the upstream Django `/analysis/` HTML and parses each
 * sub-tab's task table into `TaskSummary`-shaped rows.
 *
 * Lets the SPA display the same Recent listing as upstream even when
 * pointed at a vanilla CAPEv2 Django without our v3 app.
 */

import type { Severity, TaskStatus, TaskSummary, Verdict } from "@/types/api";

export type AnalysisCategory = "file" | "static" | "url" | "pcap";

export interface UpstreamAnalysisScrape {
  tabs: {
    file: boolean;
    static: boolean;
    url: boolean;
    pcap: boolean;
  };
  rows: Record<AnalysisCategory, TaskSummary[]>;
}

export async function fetchUpstreamAnalysisScrape(): Promise<UpstreamAnalysisScrape> {
  const resp = await fetch("/_upstream/analysis/", {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /analysis/ → HTTP ${resp.status}`);
  }
  return parseUpstreamAnalysisHtml(await resp.text());
}

const TAB_ID_TO_CATEGORY: Record<string, AnalysisCategory> = {
  "files-tab": "file",
  "static-tab": "static",
  "urls-tab": "url",
  "pcaps-tab": "pcap",
};
const PANEL_ID_TO_CATEGORY: Record<string, AnalysisCategory> = {
  files: "file",
  static: "static",
  urls: "url",
  pcaps: "pcap",
};

export function parseUpstreamAnalysisHtml(html: string): UpstreamAnalysisScrape {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tabs: UpstreamAnalysisScrape["tabs"] = {
    file: false,
    static: false,
    url: false,
    pcap: false,
  };
  for (const a of doc.querySelectorAll("ul#analysisTabs a[id$='-tab']")) {
    const id = a.getAttribute("id") ?? "";
    const cat = TAB_ID_TO_CATEGORY[id];
    if (cat) tabs[cat] = true;
  }

  const rows: Record<AnalysisCategory, TaskSummary[]> = {
    file: [],
    static: [],
    url: [],
    pcap: [],
  };
  for (const [panelId, category] of Object.entries(PANEL_ID_TO_CATEGORY)) {
    const panel = doc.getElementById(panelId);
    if (!panel) continue;
    rows[category as AnalysisCategory] = parsePanelRows(panel);
  }

  return { tabs, rows };
}

function parsePanelRows(panel: Element): TaskSummary[] {
  const out: TaskSummary[] = [];
  const trs = panel.querySelectorAll("table tbody tr");
  for (const tr of trs) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 6) continue;
    const idLink = tds[0].querySelector("a[href]");
    const idMatch = idLink?.getAttribute("href")?.match(/\/(\d+)\/?$/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);

    const timestamp = textOf(tds[1]);
    const pkg = textOf(tds[2].querySelector(".badge") ?? tds[2]);
    const filenameLink = tds[3].querySelector("a");
    const target = filenameLink?.getAttribute("title") ?? textOf(tds[3]);

    const md5 = extractHashAfterLabel(tds[4], "MD5");
    const sha256 = extractHashAfterLabel(tds[4], "SHA256");

    // Detections column is left blank in upstream when there's no family
    // hit; family ends up in the cell text directly.
    const family = textOf(tds[5]) || null;

    // VT cell holds either a positives summary like "5/72" or "-"
    const vtText = textOf(tds[tds.length - 2]);

    // Status badge — text content of the last cell's badge
    const statusText = textOf(tr.querySelector("td:last-child .badge"));
    const status = mapStatus(statusText);

    out.push({
      id,
      target: target || "",
      sha256: sha256 ?? "",
      sha1: "",
      md5: md5 ?? "",
      size: 0,
      type: pkg || "",
      submitted: parseTimestamp(timestamp),
      started: null,
      completed: null,
      duration: null,
      machine: null,
      package: pkg || "",
      score: 0,
      severity: "clean" as Severity,
      verdict: "clean" as Verdict,
      family,
      signatures_count: 0,
      yara_matches: 0,
      network_count: 0,
      files_dropped: 0,
      payloads: 0,
      api_calls: 0,
      status,
      tags: [],
      // Stash VT info on the side so the table can render it without losing typing.
      // (TaskSummary doesn't have a VT field, but we keep the shape pristine.)
      ...(vtText && vtText !== "-" ? { _vt_summary: vtText } : {}),
    } as TaskSummary);
  }
  return out;
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function extractHashAfterLabel(cell: Element | undefined, label: string): string | null {
  if (!cell) return null;
  // Upstream renders <span class="text-white-50">MD5:</span> followed by an
  // <a> with the hash. Find the <a> whose preceding span text starts with
  // the label.
  for (const div of cell.querySelectorAll("div")) {
    const titleAttr = div.getAttribute("title") ?? "";
    if (titleAttr.toUpperCase().startsWith(label.toUpperCase() + ":")) {
      const a = div.querySelector("a");
      const txt = (a?.textContent ?? "").trim();
      if (txt) return txt;
    }
  }
  return null;
}

function mapStatus(text: string): TaskStatus {
  const t = text.toLowerCase().trim();
  if (t.includes("reported")) return "reported";
  if (t.includes("running")) return "running";
  if (t.includes("complet")) return "completed";
  if (t.includes("pend")) return "pending";
  if (t.includes("fail")) return "failed_processing";
  return "completed";
}

function parseTimestamp(s: string): string | null {
  if (!s) return null;
  // Upstream emits "YYYY-MM-DD HH:MM:SS"; convert to ISO-8601 (UTC).
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) return s;
  return `${m[1]}T${m[2]}Z`;
}
