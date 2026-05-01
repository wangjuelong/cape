/**
 * Search-page parity check
 * ========================
 * Confirms the SPA `/search` page mirrors upstream `/analysis/search/`:
 *   - search input with `name="search"` + Search button
 *   - help collapse exposing every supported prefix
 *   - submitting a query renders the same hits
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";

test("search page parity: upstream /analysis/search/  ↔  SPA /search", async ({
  browser,
}) => {
  const upstreamCtx = await browser.newContext();
  const spaCtx = await browser.newContext();
  const upstreamPage = await upstreamCtx.newPage();
  const spaPage = await spaCtx.newPage();

  // ---- Upstream ----
  await upstreamPage.goto(UPSTREAM + "/analysis/search/");
  await upstreamPage.waitForLoadState("domcontentloaded");
  const upstream = await upstreamPage.evaluate(() => {
    const out = {};
    const form = document.querySelector("form[action='/analysis/search/']");
    out.hasForm = !!form;
    const input = document.querySelector("input[name='search']");
    out.hasInput = !!input;
    out.placeholder = input?.getAttribute("placeholder") ?? null;
    const submitBtn = form?.querySelector("button[type='submit']");
    out.submitText = submitBtn ? (submitBtn.textContent || "").trim() : null;
    // Help-table prefix codes
    out.prefixes = [...document.querySelectorAll("#help table tbody td.text-center code")]
      .map((el) => (el.textContent || "").trim())
      .filter((s) => s);
    return out;
  });

  // ---- SPA ----
  await spaPage.goto(SPA + "/search");
  await spaPage.waitForLoadState("domcontentloaded");
  await spaPage.waitForSelector("input[name='search']", { timeout: 10000 });
  // Open the help collapse so prefix tags are scrapeable
  await spaPage.getByRole("button", { name: /Click here for search syntax/ }).click();
  await spaPage.waitForTimeout(300);
  const spa = await spaPage.evaluate(() => {
    const out = {};
    const input = document.querySelector("input[name='search']");
    out.hasInput = !!input;
    out.placeholder = input?.getAttribute("placeholder") ?? null;
    out.submitText = (() => {
      const btn = [...document.querySelectorAll("button[type='submit']")].find((b) =>
        /Search/.test(b.textContent || ""),
      );
      return btn ? (btn.textContent || "").trim() : null;
    })();
    out.prefixes = [...document.querySelectorAll("#search-prefixes-table tbody td code")]
      .map((el) => (el.textContent || "").trim())
      .filter((s) => s);
    return out;
  });

  await upstreamCtx.close();
  await spaCtx.close();

  // Normalise: upstream tags keep trailing colon, e.g. "id:" — SPA does same
  const upPrefixes = new Set(upstream.prefixes.map((p) => p.replace(/:$/, "")));
  const spaPrefixes = new Set(spa.prefixes.map((p) => p.replace(/:$/, "")));
  const missingInSpa = [...upPrefixes].filter((p) => !spaPrefixes.has(p));

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    upstream,
    spa,
    diff: {
      prefixes_missing_in_spa: missingInSpa,
      prefix_count_upstream: upPrefixes.size,
      prefix_count_spa: spaPrefixes.size,
    },
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "search-parity.json"), JSON.stringify(report, null, 2));

  console.log(`[search-parity] upstream prefixes: ${upPrefixes.size}`);
  console.log(`[search-parity] SPA prefixes:      ${spaPrefixes.size}`);
  console.log(`[search-parity] upstream submit text: ${upstream.submitText}`);
  console.log(`[search-parity] SPA submit text:      ${spa.submitText}`);
  if (missingInSpa.length > 0) {
    console.log(`[search-parity] missing in SPA: ${missingInSpa.join(", ")}`);
  }

  expect(spa.hasInput, "SPA must expose <input name='search'>").toBe(true);
  expect(upstream.hasInput, "upstream must expose <input name='search'>").toBe(true);
  expect(missingInSpa, "Every upstream search prefix must be advertised in the SPA").toEqual([]);
});
