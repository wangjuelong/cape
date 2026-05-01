/**
 * Fallback for the Search page when our v3 endpoints aren't available —
 * GET upstream `/analysis/search/?search=<term>` and parse the rendered
 * Bootstrap results table into TaskSummary[].
 *
 * Used by `useSearch` whenever `/api/v3/search/` 404s (e.g. SPA pointed
 * at a vanilla CAPEv2 Django without our v3 app).
 */

import type { Severity, TaskStatus, TaskSummary, Verdict } from "@/types/api";

export interface UpstreamSearchResult {
  ok: boolean;
  term: string;
  raw: string;
  error: string | null;
  items: TaskSummary[];
}

export async function fetchUpstreamSearchScrape(rawQuery: string): Promise<UpstreamSearchResult> {
  const params = new URLSearchParams({ search: rawQuery });
  const resp = await fetch(`/_upstream/analysis/search/?${params.toString()}`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /analysis/search/ → HTTP ${resp.status}`);
  }
  return parseUpstreamSearchHtml(await resp.text(), rawQuery);
}

export function parseUpstreamSearchHtml(html: string, rawQuery: string): UpstreamSearchResult {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Upstream renders errors inside an `.alert.alert-danger` block above
  // the search form when validation fails.
  const errorEl = doc.querySelector(".alert.alert-danger");
  const error = errorEl ? (errorEl.textContent || "").trim() || null : null;

  // Term echo: `<h3>Results for term: <span class="text-danger">{term}</span></h3>`
  let term = "";
  const termSpan = doc.querySelector("h3 .text-danger.font-weight-bold, h3 .text-danger");
  if (termSpan) term = (termSpan.textContent || "").trim();

  const items: TaskSummary[] = [];
  for (const tr of doc.querySelectorAll(".card .table-responsive table tbody tr")) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 6) continue;
    const idText = textOf(tds[0]).replace(/^#/, "");
    const id = Number(idText);
    if (!Number.isFinite(id) || id <= 0) continue;

    const timestamp = textOf(tds[1])
      .replace(/\(added\)\s*$/, "")
      .trim();
    const pkg = textOf(tds[2].querySelector(".badge") ?? tds[2]);
    const filename = (tds[3].getAttribute("title") || textOf(tds[3])).trim();
    const targetCell = tds[4];
    const target =
      targetCell.getAttribute("title") || textOf(targetCell.querySelector("a") ?? targetCell);

    const detectionsBadge = tds[5].querySelector(".badge");
    let family: string | null = null;
    if (detectionsBadge) {
      const txt = (detectionsBadge.textContent || "").trim();
      if (txt && !/^Multiple\s/i.test(txt)) family = txt;
    }

    const lastTd = tds[tds.length - 1];
    const statusBadge = lastTd.querySelector(".badge");
    const statusText = (statusBadge?.textContent || "").trim().toLowerCase();
    const status = mapStatus(statusText);

    items.push({
      id,
      target: target || filename || "",
      sha256: "",
      sha1: "",
      md5: looksLikeMd5(target) ? target : "",
      size: 0,
      type: "",
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
    });
  }

  return {
    ok: error === null,
    term,
    raw: rawQuery,
    error,
    items,
  };
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function looksLikeMd5(s: string): boolean {
  return /^[a-f0-9]{32}$/i.test(s);
}

function parseTimestamp(s: string): string {
  if (!s) return "";
  const m = s.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!m) return s;
  return `${m[1]}T${m[2]}Z`;
}

function mapStatus(text: string): TaskStatus {
  if (text.includes("reported")) return "reported";
  if (text.includes("running")) return "running";
  if (text.includes("complet")) return "completed";
  if (text.includes("pend")) return "pending";
  if (text.includes("fail")) return "failed_processing";
  return "completed";
}
