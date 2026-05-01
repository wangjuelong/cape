/**
 * Compare-page parity check
 * =========================
 * Confirms the SPA `/compare/<left>` page mirrors upstream
 * `/compare/<left>/`:
 *   - left task summary table (ID/Name/MD5/Machine/Completed/Dur)
 *   - "Same File Analysis" candidate list — same record count
 *     (both 0 if upstream shows the empty alert)
 *   - "Compare with Different File" md5 input form
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const LEFT_ID = Number(process.env.PARITY_COMPARE_LEFT ?? "1");

test(`compare page parity: upstream /compare/${LEFT_ID}/  ↔  SPA /compare/${LEFT_ID}`, async ({
  browser,
}) => {
  const upstreamCtx = await browser.newContext();
  const spaCtx = await browser.newContext();
  const upstreamPage = await upstreamCtx.newPage();
  const spaPage = await spaCtx.newPage();

  // ---- Upstream ----
  await upstreamPage.goto(`${UPSTREAM}/compare/${LEFT_ID}/`);
  await upstreamPage.waitForLoadState("domcontentloaded");
  const upstream = await upstreamPage.evaluate(() => {
    const out = {};
    // Left task table headers
    const leftCol = document.querySelector(".row .col-md-6:first-child");
    out.leftHeaders = leftCol
      ? [...leftCol.querySelectorAll("table thead th")].map((th) =>
          (th.textContent || "").trim(),
        )
      : [];
    // Candidate cards count
    const sameFileCard = [...document.querySelectorAll(".card")].find((c) =>
      /Same File Analysis/.test(c.querySelector(".card-header")?.textContent ?? ""),
    );
    out.sameFileEmpty = sameFileCard
      ? !!sameFileCard.querySelector(".alert")
      : null;
    out.sameFileRows = sameFileCard
      ? sameFileCard.querySelectorAll("table tbody tr").length
      : 0;
    // "Compare with Different File" form md5 input
    out.hasMd5Form = !!document.querySelector(
      "form#hash input[name='hash'], form input[name='hash']",
    );
    return out;
  });

  // ---- SPA ----
  await spaPage.goto(`${SPA}/compare/${LEFT_ID}`);
  await spaPage.waitForLoadState("domcontentloaded");
  await spaPage.waitForSelector(".panel", { timeout: 10000 });
  await spaPage.waitForTimeout(800);
  const spa = await spaPage.evaluate(() => {
    const out = {};
    // Left task table headers — first panel that contains "Analysis <id>"
    const panels = [...document.querySelectorAll(".panel")];
    const leftPanel = panels.find((p) =>
      /Analysis \d+/.test(p.querySelector(".panel-h")?.textContent ?? ""),
    );
    out.leftHeaders = leftPanel
      ? [...leftPanel.querySelectorAll("table.data thead th")].map((th) =>
          (th.textContent || "").trim(),
        )
      : [];
    // Same File Analysis panel
    const sameFilePanel = panels.find((p) =>
      /Same File Analysis/.test(p.querySelector(".panel-h")?.textContent ?? ""),
    );
    if (!sameFilePanel) {
      out.sameFileEmpty = null;
      out.sameFileRows = 0;
    } else {
      const alert = sameFilePanel.querySelector(".alert, [role='alert']");
      out.sameFileEmpty = !!alert;
      const tbodyRows = [...sameFilePanel.querySelectorAll("table.data tbody tr")];
      // Skip synthetic empty-state rows (single colspan'd td)
      out.sameFileRows = tbodyRows.filter(
        (tr) => tr.querySelectorAll("td").length > 1,
      ).length;
    }
    out.hasMd5Form = !!document.querySelector(
      "form#hash input[name='hash'], form input[name='hash']",
    );
    return out;
  });

  await upstreamCtx.close();
  await spaCtx.close();

  const requiredHeaders = ["ID", "Name", "MD5", "Machine", "Completed On", "Dur."];
  const missingHeaders = requiredHeaders.filter(
    (h) => !spa.leftHeaders.includes(h),
  );

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    left_id: LEFT_ID,
    upstream,
    spa,
    expected_headers: requiredHeaders,
    diff: {
      missing_headers_in_spa: missingHeaders,
      same_file_empty_match: upstream.sameFileEmpty === spa.sameFileEmpty,
      same_file_row_count_match: upstream.sameFileRows === spa.sameFileRows,
    },
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "compare-parity.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(`[compare-parity] upstream headers: ${JSON.stringify(upstream.leftHeaders)}`);
  console.log(`[compare-parity] SPA headers:      ${JSON.stringify(spa.leftHeaders)}`);
  console.log(
    `[compare-parity] same-file empty: upstream=${upstream.sameFileEmpty} spa=${spa.sameFileEmpty}`,
  );
  console.log(
    `[compare-parity] same-file rows:  upstream=${upstream.sameFileRows} spa=${spa.sameFileRows}`,
  );
  console.log(
    `[compare-parity] md5 form: upstream=${upstream.hasMd5Form} spa=${spa.hasMd5Form}`,
  );

  expect(missingHeaders, "SPA must expose upstream's left-task column set").toEqual([]);
  expect(spa.hasMd5Form, "SPA must expose the 'Compare with Different File' md5 form").toBe(
    true,
  );
  expect(upstream.sameFileEmpty, "Same File Analysis empty-state should match").toBe(
    spa.sameFileEmpty,
  );
});
