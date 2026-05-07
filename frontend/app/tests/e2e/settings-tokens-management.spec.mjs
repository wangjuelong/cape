/**
 * /settings — tokens admin (sub-spec #9):
 * 3-column GitHub-PAT-style list (Username | Token mask | Revoke),
 * Add Token modal opens with a no-token-user dropdown, Generate
 * triggers RevealDialog with full key once, list refreshes.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.2.240:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "admin";

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

test("Sidebar Admin > Settings link visible to staff", async ({ page }) => {
  await login(page);
  const link = page.getByRole("link", { name: /^Settings$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/settings");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${SPA}/settings(\\?.*)?$`));
});

test("/settings list renders heading + admin row with masked token (4*4)", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/settings`);
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { name: /API Tokens/ }).first()).toBeVisible();
  // Admin row present; mask format is exactly 4 + **** + 4 = 12 chars.
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  await expect(adminRow.locator("code").first()).toHaveText(/^[a-f0-9]{4}\*{4}[a-f0-9]{4}$/);
  // No Reveal/Rotate buttons; Copy + Revoke present.
  await expect(adminRow.getByRole("button", { name: "Reveal" })).toHaveCount(0);
  await expect(adminRow.getByRole("button", { name: "Rotate" })).toHaveCount(0);
  await expect(adminRow.getByRole("button", { name: /Copy/ })).toBeVisible();
  await expect(adminRow.getByRole("button", { name: "Revoke" })).toBeVisible();
});

test("Add Token modal: select no-token user → Generate → RevealDialog → list shows new row", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new (single-page form post sub-spec #8).
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. /settings → click "Add Token" → modal opens.
  await page.goto(`${SPA}/settings`);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Add Token/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  // 3. Dropdown contains tmpUser (no-token user).
  await expect(modal.locator("select")).toBeVisible();
  await modal.locator("select").selectOption({ label: tmpUser });

  // 4. Generate → modal closes → RevealDialog opens with full 40-hex key.
  await modal.getByRole("button", { name: /^Generate$/ }).click();
  // First modal closes; the next visible dialog is the reveal one.
  // Wait for the code element with 40 hex chars to appear in any dialog.
  await expect(
    page.locator('[role="dialog"] code').filter({ hasText: /^[a-f0-9]{40}$/ }),
  ).toBeVisible({ timeout: 8000 });
  // Close the reveal dialog.
  await page
    .locator('[role="dialog"]')
    .filter({ hasText: /Token generated/ })
    .getByRole("button", { name: "Close" })
    .last()
    .click();

  // 5. Settings list refreshed — tmpUser row visible with masked token.
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible({ timeout: 8000 });
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{4}\*{4}[a-f0-9]{4}$/);

  // 6. Revoke removes the row from the list (has-token-only filter).
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row).toBeHidden({ timeout: 8000 });

  // 7. Cleanup: delete temp user via /users → detail page → Delete.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});

test("/tokens and /configs routes are removed (SPA NotFound after login)", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  // SPA renders client-side NotFound — page should not contain "API Tokens" heading.
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { name: /API Tokens/ })).toHaveCount(0);
  await page.goto(`${SPA}/configs`);
  await page.waitForTimeout(1500);
  // No "Extracted configurations" stub heading either.
  await expect(page.getByText(/Extracted configurations/)).toHaveCount(0);
});
