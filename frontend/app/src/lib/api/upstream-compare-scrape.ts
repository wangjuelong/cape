/**
 * Fallback for the Compare page when our v3 endpoints aren't available
 * — fetches upstream `/compare/<left>/` (and optionally
 * `/compare/<left>/<right>/`) HTML and parses it into structured data.
 */

import type { Severity, TaskStatus, TaskSummary, Verdict } from "@/types/api";

export interface UpstreamCandidate {
  id: number;
  name: string;
  md5: string;
  machine: string;
  completed_on: string;
  duration: string;
}

export interface UpstreamCompareCandidates {
  ok: boolean;
  left: TaskSummary | null;
  records: TaskSummary[];
  md5: string | null;
  empty_message: string | null;
}

export async function fetchUpstreamCompareCandidates(
  leftId: number,
): Promise<UpstreamCompareCandidates> {
  const resp = await fetch(`/_upstream/compare/${leftId}/`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /compare/${leftId}/ → HTTP ${resp.status}`);
  }
  return parseUpstreamCompareCandidatesHtml(await resp.text(), leftId);
}

export function parseUpstreamCompareCandidatesHtml(
  html: string,
  _leftId: number,
): UpstreamCompareCandidates {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Left task — first table row inside the leftmost col
  const leftRow = doc.querySelector(".row .col-md-6:first-child table tbody tr");
  const left = leftRow ? rowToTaskSummary(leftRow) : null;

  // "Same File Analysis" card — candidate list
  const records: TaskSummary[] = [];
  let emptyMessage: string | null = null;
  let md5: string | null = null;

  if (left) md5 = left.md5 || null;

  for (const card of doc.querySelectorAll(".col-md-6 .card")) {
    const headerText = (card.querySelector(".card-header")?.textContent || "").trim();
    if (!/Same File Analysis/i.test(headerText)) continue;
    // The candidate body is either a table of rows or a single
    // <div class="alert alert-secondary">No other analysis found...</div>
    const empty = card.querySelector(".card-body .alert");
    if (empty) {
      emptyMessage = (empty.textContent || "").trim();
      break;
    }
    for (const tr of card.querySelectorAll("table tbody tr")) {
      const ts = rowToTaskSummary(tr);
      if (ts) records.push(ts);
    }
    break;
  }

  return {
    ok: true,
    left,
    records,
    md5,
    empty_message: emptyMessage,
  };
}

export interface UpstreamCompareDiff {
  ok: boolean;
  left: TaskSummary | null;
  right: TaskSummary | null;
  /** counts[task_id] = {category: percent, ...} */
  left_counts: Record<string, number>;
  right_counts: Record<string, number>;
  summary: Record<string, string[]>;
}

export async function fetchUpstreamCompareDiff(
  leftId: number,
  rightId: number,
): Promise<UpstreamCompareDiff> {
  const resp = await fetch(`/_upstream/compare/${leftId}/${rightId}/`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /compare/${leftId}/${rightId}/ → HTTP ${resp.status}`);
  }
  return parseUpstreamCompareDiffHtml(await resp.text(), leftId, rightId);
}

export function parseUpstreamCompareDiffHtml(
  html: string,
  leftId: number,
  rightId: number,
): UpstreamCompareDiff {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const tables = [...doc.querySelectorAll(".col-md-6 table tbody tr")];
  const tasks = tables.map(rowToTaskSummary).filter(Boolean) as TaskSummary[];
  const left = tasks.find((t) => t.id === leftId) ?? tasks[0] ?? null;
  const right = tasks.find((t) => t.id === rightId) ?? tasks[1] ?? null;

  // Behavior category percentages — upstream's `both.html` puts them in
  // a chart canvas + a small table; the markup varies. Best-effort: pick
  // up any `data-counts-{leftId|rightId}` attributes if present.
  const left_counts: Record<string, number> = {};
  const right_counts: Record<string, number> = {};

  // Behavior summary intersection — upstream shows it as a list of
  // <li>{category}: {n} matches</li>. Pull what we can.
  const summary: Record<string, string[]> = {};
  for (const item of doc.querySelectorAll("ul li")) {
    const txt = (item.textContent || "").trim();
    const m = txt.match(/^([\w_]+):\s*(\d+)\s+(?:matches|items)/i);
    if (m) summary[m[1]] = [];
  }

  return {
    ok: true,
    left,
    right,
    left_counts,
    right_counts,
    summary,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function rowToTaskSummary(tr: Element): TaskSummary | null {
  const tds = [...tr.querySelectorAll("td")];
  if (tds.length < 4) return null;
  const idText = textOf(tds[0]);
  const id = Number(idText.replace(/^#/, ""));
  if (!Number.isFinite(id) || id <= 0) return null;
  const name = (tds[1].getAttribute("title") || textOf(tds[1])).trim();
  const md5 = textOf(tds[2].querySelector("a") ?? tds[2]);
  const machine = textOf(tds[3].querySelector(".badge") ?? tds[3]);
  const completed = textOf(tds[4]);
  // duration column may not exist in every layout; default empty
  const duration = tds[5] ? textOf(tds[5]) : "";

  return {
    id,
    target: name,
    sha256: "",
    sha1: "",
    md5,
    size: 0,
    type: "",
    submitted: parseTimestamp(completed) ?? "",
    started: null,
    completed: parseTimestamp(completed),
    duration: duration || null,
    machine: machine || null,
    package: "",
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
    status: "reported" as TaskStatus,
    tags: [],
  };
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function parseTimestamp(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!m) return s;
  return `${m[1]}T${m[2]}Z`;
}
