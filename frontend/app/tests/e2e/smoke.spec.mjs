/**
 * Smoke test for the SPA running against a live deployment.
 *
 * Defaults to 192.168.1.6:8000 (the project test box). Override via env:
 *   PARITY_SPA_URL    — base URL (default http://192.168.1.6:8000)
 *   SPA_LOGIN_USER    — username (default admin)
 *   SPA_LOGIN_PASS    — password (default cape123!)
 *
 * Same env-var convention as audit-log.spec.mjs / phase-a-network-probe.spec.mjs.
 */

import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

test.describe.configure({ mode: "serial" });

async function login(page) {
  await page.goto(`${SPA}/`);
  await page.waitForURL(/\/accounts\/login\//, { timeout: 15000 });
  await page.locator('input[name="login"]').fill(USER);
  await page.locator('input[name="password"]').fill(PASS);
  // Scope to the login form — base.html renders a topbar search form
  // BEFORE the login form, so the first submit button on the page is
  // the search button.
  await page.locator('form[method="post"] button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/accounts/"), {
    timeout: 15000,
  });
}

test("00 login page uses new SPA-skinned theme", async ({ page }) => {
  await page.goto(`${SPA}/accounts/login/`);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/00-login-page.png", fullPage: true });
  // Must use the new auth layout
  await expect(page.locator(".cape-auth__brand")).toBeVisible();
  await expect(page.locator(".cape-auth__card")).toBeVisible();
  // Must NOT carry the legacy navbar
  await expect(page.locator(".navbar-brand")).toHaveCount(0);
});

test("01 login → SPA renders shell with real username", async ({ page }) => {
  const events = [];
  page.on("console", (msg) => events.push(`console.${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => events.push(`pageerror: ${err.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/static/")) {
      events.push(`http ${r.status()} ${r.url()}`);
    }
  });

  await login(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
  console.log(`post-login url=${page.url()}`);
  await page.screenshot({ path: "test-results/01-shell.png", fullPage: true });

  // Topbar should render the SPA Shell. Check for "CAPE" brand text first
  // (deterministic), then the real username.
  await expect(page.locator("text=CAPE").first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator(`text=${USER}`).first()).toBeVisible({ timeout: 10000 });

  if (events.length) {
    console.log("=== events ===");
    for (const e of events) console.log("  ", e);
  }
});

test("02 /recent renders TaskTable with seeded tasks", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/recent`);
  // SSE keeps the network active; can't rely on networkidle. domcontentloaded is enough.
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/02-recent.png", fullPage: true });
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  const count = await rows.count();
  console.log(`recent table rows: ${count}`);
  expect(count).toBeGreaterThan(0);
});

test("03 task detail renders verdict banner + tabs", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/recent`);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.locator('a[href^="/tasks/"]').first().click();
  await page.waitForURL(/\/tasks\/\d+/, { timeout: 10000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/03-task-detail.png", fullPage: true });
  // Verdict banner shows verdict pill (CLEAN for our test tasks)
  await expect(page.locator("text=/CLEAN|MALICIOUS|SUSPICIOUS/").first()).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('[role="tab"]').first()).toBeVisible();
});

test("04 /submit renders default tabs + Advanced + Extended capabilities", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/submit`);
  // Wait for the lazy chunk to settle and the form to mount.
  await page.waitForSelector("text=Advanced options", { timeout: 15000 });
  await page.screenshot({ path: "test-results/04-submit.png", fullPage: true });

  // Tabs File(s) / PCAP / Static are gated behind `filecreate` and
  // `staticextraction` feature flags which are enabled on every CAPE
  // deployment. Download / DL & Exec are conditional on additional
  // flags (`downloading_services`, `dlnexeccreate`) and may be absent —
  // do NOT assert them in a smoke check.
  for (const tabLabel of ["File(s)", "PCAP", "Static"]) {
    // exact match avoids "Static" matching the sidebar's "Statistics" link
    await expect(page.getByRole("button", { name: tabLabel, exact: true })).toBeVisible();
  }

  await expect(page.getByText("Advanced options")).toBeVisible();
  // Two matches: the heading (exact "Extended capabilities") and the
  // toggle button "Toggle Extended Capabilities (N)". Match exactly to
  // disambiguate.
  await expect(page.getByText("Extended capabilities", { exact: true })).toBeVisible();
});

test("05 /pending renders LiveIndicator", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/pending`);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/05-pending.png", fullPage: true });
  await expect(page.locator("text=/Live|Connecting/").first()).toBeVisible({
    timeout: 8000,
  });
});

test("06 sign-out flow: dropdown → POST /accounts/logout/ → /accounts/login/", async ({
  page,
}) => {
  await login(page);
  await page.waitForTimeout(800); // let useCurrentUser populate

  // Click the topbar account button to open the dropdown
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.screenshot({ path: "test-results/06-account-menu-open.png", fullPage: true });

  // The dropdown should expose "Sign out" with the danger style
  const signOut = page.getByRole("menuitem", { name: /Sign out/ });
  await expect(signOut).toBeVisible({ timeout: 5000 });

  // Watch the network round trip
  const logoutResp = page.waitForResponse(
    (r) => r.url().endsWith("/accounts/logout/") && r.request().method() === "POST",
    { timeout: 10000 },
  );

  await signOut.click();
  await logoutResp;

  // After logout the SPA should land on /accounts/login/ (allauth)
  await page.waitForURL(/\/accounts\/login\//, { timeout: 10000 });
  await expect(page.locator(".cape-auth__brand")).toBeVisible();
});
