/**
 * /users SPA management surface — list / single-page detail / avatar dropdown.
 *
 * Uses an EPHEMERAL test user `e2e-tmp` to avoid disturbing admin/cuckoo
 * setup. The test creates the user, edits a Basic field, then deletes it.
 * Token administration moved to the standalone /tokens page (see
 * tokens-management.spec.mjs).
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

test("/users list renders and shows admin", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/users`);
  await page.waitForTimeout(1500);
  await expect(page.locator("table.data tbody tr")).not.toHaveCount(0);
  await expect(page.locator("text=admin").first()).toBeVisible();
});

test("create + edit + delete e2e-tmp user", async ({ page }) => {
  test.setTimeout(120000);
  await login(page);

  // 1. create — form input order: username, password, confirm, email, first_name, last_name
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill("e2e-tmp");
  await formInputs.nth(1).fill("E2eTmpPass987!");
  await formInputs.nth(2).fill("E2eTmpPass987!");
  await formInputs.nth(3).fill("e2e@example.com");
  await page.getByRole("button", { name: "Create user" }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. Single-page detail — change first_name → save.
  // Detail inputs (in <main>): 0=username (readonly), 1=email, 2=first_name, 3=last_name
  await page.locator('main input:not([type="checkbox"])').nth(2).fill("E2E");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("User updated.")).toBeVisible({ timeout: 4000 });

  // 3. Delete user (cleanup)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});

test("avatar dropdown API token modal works", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("menuitem", { name: /API token/ }).click();
  await expect(page.getByRole("heading", { name: "API token" })).toBeVisible({ timeout: 4000 });
  // Two "Close" buttons exist (dialog X icon + footer button); click the footer text button.
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
});
