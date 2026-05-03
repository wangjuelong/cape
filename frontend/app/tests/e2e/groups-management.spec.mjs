/**
 * /groups SPA management surface — list / create / edit / members /
 * delete round-trip.
 *
 * Uses an EPHEMERAL test group `e2e-grp-tmp` so admin's real groups
 * stay untouched.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

async function login(page) {
  await page.goto(`${SPA}/accounts/login/`);
  await page.fill('input[name="login"]', USER);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

test.describe.configure({ mode: "serial" });

test("Sidebar Admin > Groups link visible to staff", async ({ page }) => {
  await login(page);
  const link = page.getByRole("link", { name: /^Groups/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/groups");
});

test("/groups list renders", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/groups`);
  await page.waitForTimeout(1500);
  // Either rows or empty-state acceptable; the page itself must render.
  const headings = await page.getByRole("heading", { name: /Groups/ }).count();
  expect(headings).toBeGreaterThan(0);
});

test("/groups filter bar narrows by search → Apply", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/groups`);
  await page.waitForTimeout(1500);
  // Type a string very unlikely to match any real group, then Apply —
  // URL should reflect ?search=, and the table should be empty (or at
  // worst contain only matching rows).
  const filterInput = page.locator('main input[placeholder*="Search by name"]');
  await filterInput.fill("zzz-no-such-group-xyz");
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await expect(page).toHaveURL(/\?search=zzz-no-such-group-xyz/, { timeout: 4000 });
  // 0 data rows expected (header row stays).
  await expect(page.locator("table.data tbody tr")).toHaveCount(0);
});

test("create + edit + delete e2e-grp-tmp", async ({ page }) => {
  test.setTimeout(120000);
  await login(page);

  // 1. create — first non-checkbox input inside the form is the Name field
  await page.goto(`${SPA}/groups/new`);
  await page.locator('form input:not([type="checkbox"])').first().fill("e2e-grp-tmp");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.waitForURL(/\/groups\/\d+$/, { timeout: 10000 });

  // 2. rename in Basic tab — wait for detail to load so the useEffect that
  //    syncs the name field doesn't clobber our fill() afterwards.
  await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible({ timeout: 10000 });
  const renameInput = page.locator('main input:not([type="checkbox"])').first();
  await expect(renameInput).toHaveValue("e2e-grp-tmp", { timeout: 10000 });
  await renameInput.fill("e2e-grp-tmp-renamed");
  await page.getByRole("button", { name: /^Save$/ }).click();
  await expect(page.getByText("Group saved.")).toBeVisible({ timeout: 4000 });

  // 3. delete (clean up)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete group/ }).click();
  await page.waitForURL(/\/groups(\?.*)?$/, { timeout: 10000 });
});
