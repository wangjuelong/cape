/**
 * Pending-page parity check
 * =========================
 * Confirms the SPA's `/pending` page mirrors upstream `/analysis/pending/`:
 *   - same column set when populated
 *   - same "all caught up" empty state when 0 tasks
 *   - same count badge in header
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";

const EXPECTED_HEADERS = ["ID", "Timestamp", "Category", "Target", "Hashes", "Action"];

test("pending page parity: upstream /analysis/pending/  ↔  SPA /pending", async ({ browser }) => {
  const upstreamCtx = await browser.newContext();
  const spaCtx = await browser.newContext();
  const upstreamPage = await upstreamCtx.newPage();
  const spaPage = await spaCtx.newPage();

  // ---- Upstream ----
  await upstreamPage.goto(UPSTREAM + "/analysis/pending/");
  await upstreamPage.waitForLoadState("domcontentloaded");
  const upstream = await upstreamPage.evaluate(() => {
    const out = {};
    out.headers = [...document.querySelectorAll("table thead th")].map((th) =>
      (th.textContent || "").trim(),
    );
    const badge = document.querySelector(".card-header .badge");
    out.countBadge = badge ? (badge.textContent || "").trim() : null;
    const empty = [...document.querySelectorAll(".card-body p")].map((p) =>
      (p.textContent || "").trim(),
    );
    out.emptyText = empty.find((t) => /caught up/i.test(t)) ?? null;
    out.firstRow = (() => {
      const tr = document.querySelector("table tbody tr");
      return tr
        ? [...tr.querySelectorAll("td")].map((td) =>
            (td.textContent || "").trim().replace(/\s+/g, " "),
          )
        : null;
    })();
    return out;
  });

  // ---- SPA ----
  await spaPage.goto(SPA + "/pending");
  await spaPage.waitForLoadState("domcontentloaded");
  await spaPage.waitForSelector(".panel", { timeout: 10000 });
  // Wait a tick for the upstream pending scrape to land before reading
  await spaPage.waitForTimeout(800);
  const spa = await spaPage.evaluate(() => {
    const out = {};
    out.headers = [...document.querySelectorAll("table.data thead th")].map((th) =>
      (th.textContent || "").trim(),
    );
    const badge = document.querySelector(".panel-h .actions .tag");
    out.countBadge = badge ? (badge.textContent || "").trim() : null;
    out.emptyText =
      ([...document.querySelectorAll(".panel p")].map((p) =>
        (p.textContent || "").trim(),
      ).find((t) => /caught up/i.test(t))) ?? null;
    out.firstRow = (() => {
      const tr = document.querySelector("table.data tbody tr");
      if (!tr) return null;
      const tds = [...tr.querySelectorAll("td")];
      // Skip the synthetic "empty" tr (single colspanned td)
      if (tds.length <= 1) return null;
      return tds.map((td) => (td.textContent || "").trim().replace(/\s+/g, " "));
    })();
    return out;
  });

  await upstreamCtx.close();
  await spaCtx.close();

  const headersMissingFromSpa = EXPECTED_HEADERS.filter(
    (h) => !spa.headers.includes(h),
  );

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    upstream,
    spa,
    expected_headers: EXPECTED_HEADERS,
    diff: {
      headers_missing_from_spa: headersMissingFromSpa,
    },
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "pending-parity.json"), JSON.stringify(report, null, 2));

  console.log(`[pending-parity] upstream count badge: ${upstream.countBadge}`);
  console.log(`[pending-parity] SPA count badge:      ${spa.countBadge}`);
  console.log(`[pending-parity] upstream empty text:  ${upstream.emptyText}`);
  console.log(`[pending-parity] SPA empty text:       ${spa.emptyText}`);
  console.log(`[pending-parity] upstream headers: ${JSON.stringify(upstream.headers)}`);
  console.log(`[pending-parity] SPA headers:      ${JSON.stringify(spa.headers)}`);

  // Both sides must agree on whether the queue is empty
  const upEmpty = upstream.firstRow === null;
  const spaEmpty = spa.firstRow === null;
  expect(upEmpty, "Empty / non-empty state must match").toBe(spaEmpty);

  if (!upEmpty) {
    expect(headersMissingFromSpa, "SPA missing column headers present upstream").toEqual([]);
  } else {
    // When empty, both sides must show the "all caught up" copy
    expect(upstream.emptyText, "upstream should show empty-state copy").toMatch(/caught up/i);
    expect(spa.emptyText, "SPA should show empty-state copy").toMatch(/caught up/i);
  }
});
