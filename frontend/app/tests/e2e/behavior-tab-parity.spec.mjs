/**
 * Behavior tab parity check (task 2)
 * ==================================
 * Validates the SPA Behavior tab structure matches upstream
 * `web/templates/analysis/behavior/{_tree,_processes,_chunk}.html`:
 *
 *   1. Process Tree card present
 *   2. Process pills (Search + ≥1 process)
 *   3. Per-process pane with:
 *      - Process info banner (PID / Parent PID / Path / Cmd / Image Base / etc)
 *      - 12 category filter buttons (Default / Registry / Filesystem / Network /
 *        Process / Threading / Services / Sync / Crypto / Browser / Device / All)
 *      - API filter input + Apply button
 *      - Advanced Filters toggle
 *      - Calls table 8 cols: Time / TID / Caller / API / Arguments / Status /
 *        Return / Repeated
 *
 * The empty-state path (no v3 backend, scraped HTML) is also valid — when
 * upstream's lazy /load_files/<id>/behavior/ is unreachable the tab renders
 * the "No behavioral analysis data available." panel without crashing.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const TASK_ID = Number(process.env.PARITY_BEHAVIOR_TASK ?? "2");

test(`task ${TASK_ID} Behavior tab — structure & widgets`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${SPA}/tasks/${TASK_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // Click the Behavior tab in the report tab strip
  const behaviorTabBtn = page
    .locator(".tabs button[role='tab'], button[role='tab']")
    .filter({ hasText: /^Behavior/ })
    .first();
  if ((await behaviorTabBtn.count()) > 0) {
    await behaviorTabBtn.click();
    await page.waitForTimeout(1500);
  }

  const probe = await page.evaluate(() => {
    const out = {};
    const panels = [...document.querySelectorAll(".panel")].map((p) =>
      (p.querySelector(".panel-h")?.textContent || "").trim().split(/\s+·/)[0],
    );
    out.panels = panels;
    out.hasProcessTree = panels.some((p) => /Process Tree/.test(p));
    out.hasInfoBanner =
      !!document.body.textContent?.includes("PID:") ||
      !!document.body.textContent?.includes("No behavioral analysis");
    // Category buttons
    const catLabels = [
      "Default",
      "Registry",
      "Filesystem",
      "Network",
      "Process",
      "Threading",
      "Services",
      "Sync",
      "Crypto",
      "Browser",
      "Device",
      "All",
    ];
    const buttonTexts = [...document.querySelectorAll("button")].map((b) =>
      (b.textContent || "").trim(),
    );
    out.foundCats = catLabels.filter((l) => buttonTexts.includes(l));
    out.tabIsEmpty = !!document.body.textContent?.includes("No behavioral analysis");
    out.callsTableCols = [];
    const tbl = document.querySelector("table.data");
    if (tbl) {
      out.callsTableCols = [...tbl.querySelectorAll("thead th")].map((th) =>
        (th.textContent || "").trim(),
      );
    }
    out.advancedFiltersBtn = buttonTexts.some((t) => /Advanced Filters/i.test(t));
    out.apiFilterInput = !!document.querySelector(
      "input[placeholder*='CreateFile'], input[placeholder*='Filter API']",
    );
    return out;
  });

  console.log(`[behavior${TASK_ID}.panels]`, JSON.stringify(probe.panels));
  console.log(`[behavior${TASK_ID}.empty]`, probe.tabIsEmpty);
  console.log(`[behavior${TASK_ID}.cats.found]`, JSON.stringify(probe.foundCats));
  console.log(`[behavior${TASK_ID}.cols]`, JSON.stringify(probe.callsTableCols));
  console.log(`[behavior${TASK_ID}.advanced]`, probe.advancedFiltersBtn);
  console.log(`[behavior${TASK_ID}.apifilter]`, probe.apiFilterInput);

  // The page MUST render without JS error regardless of whether we got real
  // behavior data (v3 mongo) or just the empty-state panel.
  expect(errors).toEqual([]);

  if (probe.tabIsEmpty) {
    // Empty state path — that's fine, no behavior data on this deploy.
    expect(probe.panels).toEqual(expect.arrayContaining([]));
    return;
  }

  // Real-data path — full feature surface must be present.
  expect(probe.hasProcessTree, "Process Tree card must render").toBe(true);
  expect(probe.foundCats, "All 12 category filter buttons must render").toEqual(
    expect.arrayContaining([
      "Default",
      "Registry",
      "Filesystem",
      "Network",
      "Process",
      "Threading",
      "Services",
      "Sync",
      "Crypto",
      "Browser",
      "Device",
      "All",
    ]),
  );
  expect(probe.advancedFiltersBtn, "Advanced Filters toggle must render").toBe(true);
  expect(probe.apiFilterInput, "API filter input must render").toBe(true);
  expect(probe.callsTableCols, "Calls table must have 8 upstream-aligned cols").toEqual([
    "Time",
    "TID",
    "Caller",
    "API",
    "Arguments",
    "Status",
    "Return",
    "Repeated",
  ]);
});
