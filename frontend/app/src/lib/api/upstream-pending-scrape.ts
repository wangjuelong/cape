/**
 * Fallback for the Pending page when our v3 endpoints aren't available —
 * fetches the upstream Django `/analysis/pending/` HTML and parses the
 * single pending-tasks table into `TaskSummary`-shaped rows.
 *
 * Upstream's `/analysis/` listing EXCLUDES pending tasks (`not_status=
 * TASK_PENDING`), so a separate endpoint + scrape is needed.
 */

import type { Severity, TaskStatus, TaskSummary, Verdict } from "@/types/api";

export interface UpstreamPendingScrape {
  count: number;
  tasks: TaskSummary[];
}

export async function fetchUpstreamPendingScrape(): Promise<UpstreamPendingScrape> {
  const resp = await fetch("/_upstream/analysis/pending/", {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /analysis/pending/ → HTTP ${resp.status}`);
  }
  return parseUpstreamPendingHtml(await resp.text());
}

export function parseUpstreamPendingHtml(html: string): UpstreamPendingScrape {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Upstream renders the row count in the card-header badge:
  //   <span class="badge bg-warning">{{count}} pending</span>
  let count = 0;
  for (const badge of doc.querySelectorAll(".card-header .badge")) {
    const text = (badge.textContent || "").trim();
    const m = text.match(/^(\d+)\s+pending$/);
    if (m) {
      count = Number(m[1]);
      break;
    }
  }

  const tasks: TaskSummary[] = [];
  for (const tr of doc.querySelectorAll("table tbody tr")) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 5) continue;

    const id = Number(textOf(tds[0]).replace(/^#?/, ""));
    if (!Number.isFinite(id) || id <= 0) continue;
    const timestamp = textOf(tds[1]);
    const category = textOf(tds[2].querySelector(".badge") ?? tds[2]).toLowerCase();
    const target =
      tds[3].getAttribute("title") ||
      textOf(tds[3].querySelector("a") ?? tds[3]);
    const md5 = extractHashByLabel(tds[4], "MD5");
    const sha256 = extractHashByLabel(tds[4], "SHA256");

    tasks.push({
      id,
      target: target || "",
      sha256: sha256 ?? "",
      sha1: "",
      md5: md5 ?? "",
      size: 0,
      type: "",
      submitted: parseTimestamp(timestamp) ?? "",
      started: null,
      completed: null,
      duration: null,
      machine: null,
      package: category || "",
      score: 0,
      severity: "clean" as Severity,
      verdict: "clean" as Verdict,
      family: null,
      signatures_count: 0,
      yara_matches: 0,
      network_count: 0,
      files_dropped: 0,
      payloads: 0,
      api_calls: 0,
      status: "pending" as TaskStatus,
      tags: [],
    });
  }

  return { count: count || tasks.length, tasks };
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function extractHashByLabel(cell: Element | undefined, label: string): string | null {
  if (!cell) return null;
  for (const div of cell.querySelectorAll("div")) {
    const titleAttr = div.getAttribute("title") ?? "";
    if (titleAttr.toUpperCase().startsWith(label.toUpperCase() + ":")) {
      // upstream renders "<span>MD5:</span> <span class='text-monospace'>HASH</span>"
      const spans = div.querySelectorAll("span");
      const last = spans[spans.length - 1];
      const txt = (last?.textContent ?? "").trim();
      if (txt) return txt;
    }
  }
  return null;
}

function parseTimestamp(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!m) return s;
  return `${m[1]}T${m[2]}Z`;
}
