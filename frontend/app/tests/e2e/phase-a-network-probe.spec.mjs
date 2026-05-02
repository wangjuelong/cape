/**
 * Phase A verification — confirms the SPA never hits /_upstream/* after
 * scrape fallback removal. Walks Recent / Pending / Submit / Tasks /
 * Compare / Search / Statistics / Audit and asserts no /_upstream/* GETs.
 */

import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const ADMIN_USER = process.env.SPA_LOGIN_USER ?? "admin";
const ADMIN_PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

async function loginAs(page, user, pass) {
  await page.goto(`${SPA}/accounts/login/`);
  await page.fill('input[name="login"]', user);
  await page.fill('input[name="password"]', pass);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

test("SPA walks all major routes without hitting /_upstream/*", async ({ page }) => {
  const upstreamHits = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith("/_upstream/")) {
      upstreamHits.push(`${req.method()} ${u.pathname}`);
    }
  });

  await loginAs(page, ADMIN_USER, ADMIN_PASS);

  for (const route of [
    "/", "/recent", "/pending", "/submit", "/search",
    "/stats/7", "/audit", "/tasks/1", "/compare/1",
  ]) {
    await page.goto(`${SPA}${route}`);
    await page.waitForTimeout(1500);
  }

  console.log("[probe] /_upstream hits:", upstreamHits.length);
  if (upstreamHits.length) console.log("[probe] hits:", upstreamHits);
  expect(upstreamHits).toEqual([]);
});
