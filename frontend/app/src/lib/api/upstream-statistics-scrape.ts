/**
 * Fallback for the Statistics page when our v3 endpoints aren't
 * available — fetches upstream `/statistics/<days>/` HTML and parses
 * each card / table region into structured data the SPA can render.
 */

export interface StatisticsTaskDay {
  day: string;
  added: number;
  reported: number;
  failed: number;
}

export interface StatisticsModuleRow {
  name: string;
  total: number;
  runs: number;
  avg: number;
}

export interface StatisticsScrape {
  days: number;
  total: number;
  average: number;
  tasks_per_day: StatisticsTaskDay[];
  processing: StatisticsModuleRow[];
  signatures: StatisticsModuleRow[];
  reporting: StatisticsModuleRow[];
  custom_statistics: StatisticsModuleRow[];
  top_samples: { day: string; sha256: string; count: number }[];
  detections: { family: string; count: number }[];
  asns: { asn: string; count: number }[];
  distributed_tasks: { day: string; node: string; count: number }[];
  error: string | null;
}

export async function fetchUpstreamStatisticsScrape(days: number): Promise<StatisticsScrape> {
  const resp = await fetch(`/_upstream/statistics/${days}/`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /statistics/${days}/ → HTTP ${resp.status}`);
  }
  return parseUpstreamStatisticsHtml(await resp.text(), days);
}

export function parseUpstreamStatisticsHtml(html: string, days: number): StatisticsScrape {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const result: StatisticsScrape = {
    days,
    total: 0,
    average: 0,
    tasks_per_day: [],
    processing: [],
    signatures: [],
    reporting: [],
    custom_statistics: [],
    top_samples: [],
    detections: [],
    asns: [],
    distributed_tasks: [],
    error: null,
  };

  // ---- Statistics Overview (3 stat tiles) ----
  // Upstream renders <h6>{label}</h6><h3>{value}</h3> in 3 cols. The
  // Total card always shows just `{n}`, Timeframe shows `{n} days`,
  // Average shows `{n}`.
  const overviewCard = findCardByTitle(doc, "Statistics Overview");
  if (overviewCard) {
    const tiles = [...overviewCard.querySelectorAll(".row.text-center .col-md-4")];
    for (const tile of tiles) {
      const label = textOf(tile.querySelector("h6"));
      const value = textOf(tile.querySelector("h3"));
      if (/timeframe/i.test(label)) {
        const m = value.match(/(\d+)/);
        if (m) result.days = Number(m[1]);
      } else if (/total tasks/i.test(label)) {
        result.total = parseIntSafe(value);
      } else if (/average/i.test(label)) {
        result.average = parseFloatSafe(value);
      }
    }
  }

  // ---- Tasks per Day ----
  const tasksCard = findCardByTitle(doc, "Tasks per Day");
  if (tasksCard) {
    for (const tr of tasksCard.querySelectorAll("table tbody tr")) {
      const cells = [...tr.children];
      if (cells.length < 4) continue;
      result.tasks_per_day.push({
        day: textOf(cells[0]),
        added: parseIntSafe(textOf(cells[1].querySelector(".badge") ?? cells[1])),
        reported: parseIntSafe(textOf(cells[2].querySelector(".badge") ?? cells[2])),
        failed: parseIntSafe(textOf(cells[3].querySelector(".badge") ?? cells[3])),
      });
    }
  }

  // ---- Module performance cards ----
  result.processing = parseModuleCard(findCardByTitle(doc, "Processing"));
  result.signatures = parseModuleCard(findCardByTitle(doc, "Signatures"));
  result.reporting = parseModuleCard(findCardByTitle(doc, "Reporting"));
  result.custom_statistics = parseModuleCard(findCardByTitle(doc, "Custom Stats"));

  // ---- Top Detections ----
  const detCard = findCardByTitle(doc, "Top Detections");
  if (detCard) {
    for (const tr of detCard.querySelectorAll("table tbody tr")) {
      const cells = [...tr.children];
      if (cells.length < 2) continue;
      result.detections.push({
        family: textOf(cells[0]),
        count: parseIntSafe(textOf(cells[1].querySelector(".badge") ?? cells[1])),
      });
    }
  }

  // ---- Top ASN ----
  const asnCard = findCardByTitle(doc, "Top ASN");
  if (asnCard) {
    for (const tr of asnCard.querySelectorAll("table tbody tr")) {
      const cells = [...tr.children];
      if (cells.length < 2) continue;
      result.asns.push({
        asn: textOf(cells[0]),
        count: parseIntSafe(textOf(cells[1].querySelector(".badge") ?? cells[1])),
      });
    }
  }

  return result;
}

function findCardByTitle(doc: Document, titleText: string): Element | null {
  for (const card of doc.querySelectorAll(".card")) {
    const h5 = card.querySelector(".card-header h5");
    if (h5 && (h5.textContent || "").trim().includes(titleText)) {
      return card;
    }
  }
  return null;
}

function parseModuleCard(card: Element | null): StatisticsModuleRow[] {
  if (!card) return [];
  const out: StatisticsModuleRow[] = [];
  for (const tr of card.querySelectorAll("table tbody tr")) {
    const cells = [...tr.children];
    if (cells.length < 4) continue;
    const name = textOf(cells[0]) || cells[0].getAttribute("title") || "";
    const total = parseFloatSafe(textOf(cells[1]));
    const runs = parseIntSafe(textOf(cells[2]));
    const avg = parseFloatSafe(textOf(cells[3]));
    out.push({ name, total, runs, avg });
  }
  return out;
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\s+/g, " ");
}

function parseIntSafe(s: string): number {
  const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFloatSafe(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
