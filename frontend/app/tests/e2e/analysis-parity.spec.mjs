/**
 * Analysis (Recent) parity check
 * ==============================
 * Confirms the SPA's `/recent` page exposes the same per-category sub-tabs
 * and per-row info as upstream `/analysis/`.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";

const EXPECTED_HEADERS = [
  "ID",
  "Timestamp",
  "Package",
  "Filename",
  "Hashes",
  "Detections",
  "VT",
  "Status",
];

test("analysis page parity: upstream /analysis/  ↔  SPA /recent", async ({ browser }) => {
  const upstreamCtx = await browser.newContext();
  const spaCtx = await browser.newContext();
  const upstreamPage = await upstreamCtx.newPage();
  const spaPage = await spaCtx.newPage();

  // ----- Upstream -----
  await upstreamPage.goto(UPSTREAM + "/analysis/");
  await upstreamPage.waitForLoadState("domcontentloaded");
  const upstream = await upstreamPage.evaluate(() => {
    const out = {};
    out.tabs = [...document.querySelectorAll("ul#analysisTabs a[id$='-tab']")].map(
      (a) => (a.getAttribute("id") || "").replace(/-tab$/, ""),
    );
    out.fileHeaders = [...document.querySelectorAll("#files table thead th")].map(
      (th) => (th.textContent || "").trim(),
    );
    out.itemBadges = [
      ...document.querySelectorAll(".card .card-header span.badge"),
    ].map((s) => (s.textContent || "").trim());
    const firstRow = document.querySelector("#files table tbody tr");
    out.firstRowCells = firstRow
      ? [...firstRow.querySelectorAll("td")].map((td) =>
          (td.textContent || "").trim().replace(/\s+/g, " "),
        )
      : [];
    return out;
  });

  // ----- SPA -----
  await spaPage.goto(SPA + "/recent");
  await spaPage.waitForLoadState("domcontentloaded");
  await spaPage.waitForSelector(".tabs button[role='tab']", { timeout: 10000 });
  const spa = await spaPage.evaluate(() => {
    const out = {};
    out.tabs = [...document.querySelectorAll(".tabs button[role='tab']")].map((b) =>
      (b.textContent || "").trim().toLowerCase(),
    );
    out.fileHeaders = [...document.querySelectorAll("table.data thead th")].map((th) =>
      (th.textContent || "").trim(),
    );
    const count = document.querySelector(".panel .panel-h .count");
    out.itemCountText = count ? (count.textContent || "").trim() : null;
    const firstRow = document.querySelector("table.data tbody tr");
    out.firstRowCells = firstRow
      ? [...firstRow.querySelectorAll("td")].map((td) =>
          (td.textContent || "").trim().replace(/\s+/g, " "),
        )
      : [];
    return out;
  });

  await upstreamCtx.close();
  await spaCtx.close();

  const tabsExtraInUpstream = upstream.tabs.filter(
    (t) => !spa.tabs.includes(t.toLowerCase()),
  );
  const tabsExtraInSPA = spa.tabs.filter((t) => !upstream.tabs.includes(t));
  const headersMissingFromSpa = EXPECTED_HEADERS.filter(
    (h) => !spa.fileHeaders.includes(h),
  );

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    upstream,
    spa,
    expected_headers: EXPECTED_HEADERS,
    diff: {
      tabs_only_upstream: tabsExtraInUpstream,
      tabs_only_spa: tabsExtraInSPA,
      headers_missing_from_spa: headersMissingFromSpa,
    },
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "analysis-parity.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(`[analysis-parity] upstream tabs: ${upstream.tabs.join(",")}`);
  console.log(`[analysis-parity] SPA tabs:      ${spa.tabs.join(",")}`);
  console.log(`[analysis-parity] upstream headers: ${JSON.stringify(upstream.fileHeaders)}`);
  console.log(`[analysis-parity] SPA headers:      ${JSON.stringify(spa.fileHeaders)}`);

  expect(headersMissingFromSpa, "SPA missing column headers present upstream").toEqual([]);
  expect(tabsExtraInUpstream, "Upstream tabs not surfaced in SPA").toEqual([]);
  expect(tabsExtraInSPA, "SPA tabs not present upstream").toEqual([]);
  expect(spa.firstRowCells.length, "SPA Files tab must render task rows").toBeGreaterThan(0);
});
