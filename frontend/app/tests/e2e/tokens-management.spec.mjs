/**
 * /tokens admin top-level page:
 * 1 row = 1 user (with or without a token). Rows without a token show
 * `⊘ None` + a Generate button. Rows with a token show the masked key
 * + Reveal/Copy + Rotate/Revoke. Revoke leaves the row visible (with
 * the Generate button restored).
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

test("Sidebar Admin > Tokens link visible to staff", async ({ page }) => {
  await login(page);
  const link = page.getByRole("link", { name: /^Tokens$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/tokens");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${SPA}/tokens(\\?.*)?$`));
});

test("/tokens list renders heading + admin row with masked token", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  // Panel heading "Tokens (N)" rendered as h2.
  await expect(page.getByRole("heading", { name: /Tokens/ }).first()).toBeVisible();
  // Admin row present (admin has a token from the historical e2e setup).
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  // Token cell shows the GitHub-style mask 6 chars + … + 4 chars.
  await expect(adminRow.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
});

test("row reveals full token then masks again, copy button works", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  const adminRow = page.locator("tr", { hasText: USER });
  await expect(adminRow).toBeVisible();
  const code = adminRow.locator("code").first();
  // Initially masked.
  await expect(code).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
  // Click the Reveal button (titled "Reveal" before reveal, "Hide" after).
  await adminRow.getByRole("button", { name: "Reveal" }).click();
  // Now full 40-char hex.
  await expect(code).toHaveText(/^[a-f0-9]{40}$/);
  // Copy button is now visible — clicking it must not throw.
  await adminRow.getByRole("button", { name: "Copy" }).click();
  // Toggle back to mask.
  await adminRow.getByRole("button", { name: "Hide" }).click();
  await expect(code).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);
});

test("generate → rotate (with reveal modal) → revoke leaves row with Generate button", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new.
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. Open /tokens, find the tmpUser row, click Generate.
  await page.goto(`${SPA}/tokens?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible();
  await expect(row).toContainText("⊘");

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Generate$/ }).click();

  // 3. RevealDialog opens with the new full key.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog.locator("code")).toHaveText(/^[a-f0-9]{30,}$/);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 4. Row now shows masked token + Rotate / Revoke.
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);

  // 5. Rotate: another RevealDialog with new key.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Rotate$/ }).click();
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 6. Revoke: row remains, Token col shows ⊘, Generate button replaces Rotate/Revoke.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row.getByRole("button", { name: /^Generate$/ })).toBeVisible({ timeout: 8000 });
  await expect(row).toContainText("⊘");

  // 7. Cleanup: delete the temp user.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});
