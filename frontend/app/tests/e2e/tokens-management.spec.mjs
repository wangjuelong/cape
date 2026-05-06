/**
 * /tokens admin top-level page (sub-spec #7 redesign):
 * 1 row = 1 active token; Token column is the primary subject with
 * mask + reveal + copy. Generate has moved to /users/<id>/Tokens —
 * test 4 generates the temp user's token from there before asserting
 * its row appears in /tokens.
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

test("temp user appears after token generation, then rotate + revoke removes it", async ({ page }) => {
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

  // 2. Generate token from the user-detail Tokens tab (Generate is no
  //    longer on the /tokens page).
  await page.getByRole("button", { name: "API Token" }).click();
  await page.getByRole("button", { name: /^Generate token$/ }).click();
  // Inline reveal in the per-user TokenSection — wait for the mono code
  // block to populate with a 40-hex key.
  await expect(
    page.locator("code.mono").filter({ hasText: /^[a-f0-9]{30,}$/ }).first(),
  ).toBeVisible({ timeout: 8000 });

  // 3. /tokens now lists the temp user.
  await page.goto(`${SPA}/tokens?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible();
  await expect(row.locator("code").first()).toHaveText(/^[a-f0-9]{6}…[a-f0-9]{4}$/);

  // 4. Rotate. window.confirm() comes first — accept it.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Rotate$/ }).click();
  // Reveal dialog appears with new full key.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog.locator("code")).toHaveText(/^[a-f0-9]{30,}$/);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 5. Revoke — row should disappear from /tokens (no token = not listed).
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  await expect(row).toBeHidden({ timeout: 8000 });

  // 6. Cleanup: delete the temp user via /users list.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});
