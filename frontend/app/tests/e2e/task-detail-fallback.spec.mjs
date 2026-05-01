/**
 * Task-detail page fallback check
 * ===============================
 * When the SPA points at a vanilla CAPEv2 deploy without our v3 app, the
 * task report page should still render via the upstream `/analysis/<id>/`
 * HTML scrape fallback rather than crash with "Could not load report".
 */

import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const TASK_ID = Number(process.env.PARITY_TASK_ID ?? "1");

test(`task detail fallback: SPA /tasks/${TASK_ID} renders against vanilla CAPE`, async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${SPA}/tasks/${TASK_ID}`);
  await page.waitForLoadState("domcontentloaded");
  // Give the upstream HTML scrape a moment to land
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const out = {};
    // Verdict banner should be present (not the error Alert)
    out.hasVerdictBanner = !!document.querySelector(".tag, [aria-label='verdict']") ||
      !!document.body.textContent?.includes("MALICIOUS") ||
      !!document.body.textContent?.includes("CLEAN") ||
      !!document.body.textContent?.includes("SUSPICIOUS");
    // Report tab strip should render
    out.tabStripRendered = document.querySelectorAll(".tabs button[role='tab']").length;
    // No "Could not load report" alert visible
    out.couldNotLoad = !!document.body.textContent?.includes("Could not load report");
    // SHA256 from upstream is "8ed378c07eace443fae1ca2ae9f96e8fa98f1d3a8bf928c271cd99ef8988b78e"
    out.sha256Present = !!document.body.textContent?.match(/8ed378c07eace443fae1ca2ae9f96e8fa98f1d3a8bf928c271cd99ef8988b78e/);
    // File name from upstream
    out.filenamePresent = !!document.body.textContent?.match(/A_+\.docx/);
    return out;
  });

  console.log(`[fallback] verdict banner: ${result.hasVerdictBanner}`);
  console.log(`[fallback] tab strip count: ${result.tabStripRendered}`);
  console.log(`[fallback] could-not-load shown: ${result.couldNotLoad}`);
  console.log(`[fallback] sha256 present: ${result.sha256Present}`);
  console.log(`[fallback] filename present: ${result.filenamePresent}`);
  if (errors.length) console.log(`[fallback] page errors: ${errors.join("\n  ")}`);

  expect(result.couldNotLoad, "SPA must not show 'Could not load report' on fallback").toBe(false);
  expect(result.tabStripRendered, "Tab strip must render at least one tab").toBeGreaterThan(0);
  expect(result.sha256Present, "Upstream SHA256 must surface in the page").toBe(true);
  expect(errors, "No page errors must occur during fallback render").toEqual([]);
});
