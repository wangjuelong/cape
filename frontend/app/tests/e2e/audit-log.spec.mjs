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

test("anonymous /audit redirects to login", async ({ page }) => {
  await page.goto(`${SPA}/audit`);
  await page.waitForTimeout(1000);
  expect(page.url()).toContain("/accounts/login/");
});

test("admin /audit shows table + filter + login_success row", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PE: ${e.message}`));

  await loginAs(page, ADMIN_USER, ADMIN_PASS);
  await page.goto(`${SPA}/audit`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/audit-after-login.png" });

  const probe = await page.evaluate(() => {
    const out = {};
    const tableHead = [...document.querySelectorAll("table.data thead th")].map((th) =>
      (th.textContent || "").trim(),
    );
    out.head = tableHead;
    out.rows = document.querySelectorAll("table.data tbody tr").length;
    out.hasFilterApply = !!document.querySelector("form button.primary");
    out.actionsInBadges = [...document.querySelectorAll("table.data tbody td span.mono")]
      .map((s) => (s.textContent || "").trim())
      .filter(Boolean);
    return out;
  });
  console.log("[audit.head]", JSON.stringify(probe.head));
  console.log("[audit.rows]", probe.rows);
  console.log("[audit.actionsBadges]", JSON.stringify(probe.actionsInBadges.slice(0, 8)));

  expect(probe.head).toEqual(["Time", "Actor", "Action", "Target", "IP", ""]);
  expect(probe.hasFilterApply).toBe(true);
  // After this very session's login, at least 1 login_success event exists.
  expect(probe.rows).toBeGreaterThan(0);
  expect(probe.actionsInBadges.some((t) => /login/i.test(t))).toBe(true);

  expect(errors).toEqual([]);
});

test("filter ?action=login_failed narrows result", async ({ page }) => {
  await loginAs(page, ADMIN_USER, ADMIN_PASS);
  await page.goto(`${SPA}/audit?action=login_failed`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/audit-filtered.png" });

  // Either 0 rows ("No events match these filters.") or all rows are login_failed.
  const result = await page.evaluate(() => {
    const empty = !!document.body.textContent?.includes("No events match");
    const badges = [...document.querySelectorAll("table.data tbody td span.mono")].map(
      (s) => (s.textContent || "").trim(),
    );
    return { empty, badges };
  });
  if (!result.empty) {
    expect(result.badges.every((b) => /login fail/i.test(b))).toBe(true);
  }
});
