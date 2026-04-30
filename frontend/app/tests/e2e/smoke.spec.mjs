/**
 * Smoke test for the SPA running against the test box at 192.168.2.240
 * (tunnelled through 127.0.0.1:8000) with vite dev at 5173.
 */

import { expect, test } from "@playwright/test";

const BASE = "http://localhost:5173";
const USER = "admin";
const PASS = "admin";

test.describe.configure({ mode: "serial" });

async function login(page) {
  await page.goto(BASE + "/");
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
  await page.goto(BASE + "/accounts/login/");
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
  await expect(page.locator("text=admin").first()).toBeVisible({ timeout: 10000 });

  if (events.length) {
    console.log("=== events ===");
    for (const e of events) console.log("  ", e);
  }
});

test("02 /recent renders TaskTable with seeded tasks", async ({ page }) => {
  await login(page);
  await page.goto(BASE + "/recent");
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
  await page.goto(BASE + "/recent");
  // SSE keeps the network active; can't rely on networkidle. domcontentloaded is enough.
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.locator('a[href^="/tasks/"]').first().click();
  await page.waitForURL(/\/tasks\/\d+/, { timeout: 10000 });
  // SSE keeps the network active; can't rely on networkidle. domcontentloaded is enough.
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/03-task-detail.png", fullPage: true });
  // Verdict banner shows verdict pill (CLEAN for our test tasks)
  await expect(page.locator("text=/CLEAN|MALICIOUS|SUSPICIOUS/").first()).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('[role="tab"]').first()).toBeVisible();
});

test("04 /submit renders 6 mode tabs + Advanced + Extended capabilities", async ({ page }) => {
  await login(page);
  await page.goto(BASE + "/submit");
  // Wait for the lazy chunk to settle and the form to mount.
  await page.waitForSelector("text=Advanced options", { timeout: 15000 });
  await page.screenshot({ path: "test-results/04-submit.png", fullPage: true });

  for (const tabLabel of ["File(s)", "URL", "PCAP", "Static"]) {
    // exact match avoids "Static" matching the sidebar's "Statistics" link
    await expect(page.getByRole("button", { name: tabLabel, exact: true })).toBeVisible();
  }

  await expect(page.getByText("Advanced options")).toBeVisible();
  await expect(page.getByText("Extended capabilities")).toBeVisible();

  await page.getByRole("button", { name: /DL & Exec/ }).click();
  await expect(page.getByText("URL pointing at the binary")).toBeVisible();
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

test("05 /pending renders LiveIndicator", async ({ page }) => {
  await login(page);
  await page.goto(BASE + "/pending");
  // SSE keeps the network active; can't rely on networkidle. domcontentloaded is enough.
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.screenshot({ path: "test-results/05-pending.png", fullPage: true });
  await expect(page.locator("text=/Live|Connecting/").first()).toBeVisible({
    timeout: 8000,
  });
});
