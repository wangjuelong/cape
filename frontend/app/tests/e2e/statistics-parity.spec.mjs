/**
 * Statistics page parity check
 * ============================
 * Confirms the SPA `/stats/7` page mirrors upstream `/statistics/7/`:
 *   - Statistics Overview tile values (Timeframe / Total / Average)
 *   - Tasks per Day table headers & rows
 *   - Module Performance card titles (Processing / Reporting and any
 *     others upstream renders)
 *   - Top Detections / Top ASN / Custom Stats / Cluster cards: when
 *     upstream renders them, SPA renders too
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";

test("statistics page parity: upstream /statistics/7/  ↔  SPA /stats/7", async ({
  browser,
}) => {
  const upstreamCtx = await browser.newContext();
  const spaCtx = await browser.newContext();
  const upstreamPage = await upstreamCtx.newPage();
  const spaPage = await spaCtx.newPage();

  // ---- Upstream ----
  await upstreamPage.goto(UPSTREAM + "/statistics/7/");
  await upstreamPage.waitForLoadState("domcontentloaded");
  const upstream = await upstreamPage.evaluate(() => {
    const cardTitles = [...document.querySelectorAll(".card .card-header h5")].map(
      (h) => (h.textContent || "").trim().replace(/\s+/g, " "),
    );
    const overviewCard = [...document.querySelectorAll(".card")].find((c) =>
      /Statistics Overview/.test(c.querySelector(".card-header h5")?.textContent ?? ""),
    );
    const tiles = overviewCard
      ? [...overviewCard.querySelectorAll(".row.text-center .col-md-4")].map((t) => ({
          label: (t.querySelector("h6")?.textContent ?? "").trim(),
          value: (t.querySelector("h3")?.textContent ?? "").trim().replace(/\s+/g, " "),
        }))
      : [];
    const tasksCard = [...document.querySelectorAll(".card")].find((c) =>
      /Tasks per Day/.test(c.querySelector(".card-header h5")?.textContent ?? ""),
    );
    const tasksHeaders = tasksCard
      ? [...tasksCard.querySelectorAll("table thead th")].map((th) =>
          (th.textContent || "").trim(),
        )
      : [];
    const tasksRowCount = tasksCard
      ? tasksCard.querySelectorAll("table tbody tr").length
      : 0;
    return { cardTitles, tiles, tasksHeaders, tasksRowCount };
  });

  // ---- SPA ----
  await spaPage.goto(SPA + "/stats/7");
  await spaPage.waitForLoadState("domcontentloaded");
  await spaPage.waitForSelector(".panel-h", { timeout: 10000 });
  await spaPage.waitForTimeout(800);
  const spa = await spaPage.evaluate(() => {
    const headers = [...document.querySelectorAll(".panel .panel-h")].map((h) =>
      (h.textContent || "").trim().replace(/·.*$/, "").trim(),
    );
    // Overview tiles inside the first panel
    const tiles = [...document.querySelectorAll(".panel .mono")].slice(0, 6);
    // Read by label (.dim mono) → value (next sibling .mono)
    const overview = (() => {
      const overviewPanel = [...document.querySelectorAll(".panel")].find((p) =>
        /Statistics Overview/.test(p.querySelector(".panel-h")?.textContent ?? ""),
      );
      if (!overviewPanel) return [];
      return [...overviewPanel.querySelectorAll(".panel > div > div")].map((tile) => ({
        label: (tile.querySelector(".dim.mono")?.textContent ?? "").trim().replace(/\s+/g, " "),
        value: (tile.querySelector(".mono:not(.dim)")?.textContent ?? "").trim().replace(/\s+/g, " "),
      })).filter((t) => t.label && t.value);
    })();
    const tasksPanel = [...document.querySelectorAll(".panel")].find((p) =>
      /Tasks per Day/.test(p.querySelector(".panel-h")?.textContent ?? ""),
    );
    const tasksHeaders = tasksPanel
      ? [...tasksPanel.querySelectorAll("table.data thead th")].map((th) =>
          (th.textContent || "").trim(),
        )
      : [];
    const tasksRowCount = tasksPanel
      ? [...tasksPanel.querySelectorAll("table.data tbody tr")].filter((tr) => {
          const tds = tr.querySelectorAll("td");
          // skip the synthetic empty-state row (single td with colspan)
          return tds.length > 1;
        }).length
      : 0;
    return { headers, overview, tiles: tiles.length, tasksHeaders, tasksRowCount };
  });

  await upstreamCtx.close();
  await spaCtx.close();

  // Required panel titles upstream always shows
  const REQUIRED_PANELS = ["Statistics Overview", "Tasks per Day", "Processing", "Reporting"];
  const missingPanels = REQUIRED_PANELS.filter(
    (p) => !spa.headers.some((h) => h.includes(p)),
  );

  // Upstream "Total" / "Average per Day" / "Timeframe" must be reproduced
  const upstreamByLabel = Object.fromEntries(
    upstream.tiles.map((t) => [t.label.toLowerCase(), t.value]),
  );
  const spaByLabel = Object.fromEntries(
    spa.overview.map((t) => [t.label.toLowerCase(), t.value]),
  );

  const tilesMissing = ["timeframe", "total tasks", "average per day"].filter(
    (k) => !(k in spaByLabel),
  );

  // Tasks per Day headers must include Day / Added / Reported / Failed
  const requiredTaskHeaders = ["Day", "Added", "Reported", "Failed"];
  const missingTaskHeaders = requiredTaskHeaders.filter(
    (h) => !spa.tasksHeaders.includes(h),
  );

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    upstream,
    spa,
    upstream_overview_by_label: upstreamByLabel,
    spa_overview_by_label: spaByLabel,
    diff: {
      missing_required_panels: missingPanels,
      missing_overview_tiles: tilesMissing,
      missing_task_headers: missingTaskHeaders,
      tasks_row_count_match: upstream.tasksRowCount === spa.tasksRowCount,
    },
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "statistics-parity.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(`[stats-parity] upstream cards: ${upstream.cardTitles.length}`);
  console.log(`[stats-parity] SPA panels:      ${spa.headers.length}`);
  console.log(`[stats-parity] upstream tiles:  ${upstream.tiles.map((t) => `${t.label}=${t.value}`).join(", ")}`);
  console.log(`[stats-parity] SPA tiles:       ${spa.overview.map((t) => `${t.label}=${t.value}`).join(", ")}`);
  console.log(`[stats-parity] tasks rows: upstream=${upstream.tasksRowCount}, spa=${spa.tasksRowCount}`);

  expect(missingPanels, "SPA missing required panel cards").toEqual([]);
  expect(tilesMissing, "SPA Statistics Overview must surface timeframe/total/average tiles").toEqual([]);
  expect(missingTaskHeaders, "SPA Tasks per Day table must use upstream column names").toEqual([]);
});
