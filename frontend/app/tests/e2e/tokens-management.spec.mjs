/**
 * /tokens admin top-level page — sidebar entry / list / filter / generate→reveal→revoke.
 *
 * Creates an EPHEMERAL test user `e2e-tok-<ts>` for the round-trip and
 * deletes it via the real /users/<id> Delete-user flow so admin's real
 * users + tokens stay untouched.
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

test("/tokens list renders heading + admin row", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  // Panel heading "Tokens (N)" rendered as h2.
  const heading = page.getByRole("heading", { name: /Tokens/ });
  await expect(heading.first()).toBeVisible();
  // Admin user is always present in the table — link cell.
  await expect(page.getByRole("link", { name: USER }).first()).toBeVisible();
});

test("/tokens filter has_token=no syncs URL", async ({ page }) => {
  await login(page);
  await page.goto(`${SPA}/tokens`);
  await page.waitForTimeout(1500);
  await page.locator("main select").first().selectOption("no");
  await page.getByRole("button", { name: /^Apply$/ }).click();
  await expect(page).toHaveURL(/has_token=no/, { timeout: 4000 });
});

test("generate → reveal modal → revoke round-trip on temp user", async ({ page }) => {
  test.setTimeout(120000);
  const tmpUser = `e2e-tok-${Date.now()}`;
  const tmpPass = "Throwaway1!";

  await login(page);

  // 1. Create temp user via /users/new. Form fields are unnamed —
  //    target by ordered position inside the form (Username,
  //    Initial password, Confirm — first three text/password inputs).
  await page.goto(`${SPA}/users/new`);
  const formInputs = page.locator('form input:not([type="checkbox"])');
  await formInputs.nth(0).fill(tmpUser);
  await formInputs.nth(1).fill(tmpPass);
  await formInputs.nth(2).fill(tmpPass);
  await page.getByRole("button", { name: /Create user/ }).click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });

  // 2. Open /tokens and find the row for tmpUser via search filter.
  await page.goto(`${SPA}/tokens?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  const row = page.locator("tr", { hasText: tmpUser });
  await expect(row).toBeVisible();

  // 3. Generate. window.confirm() comes first — accept it.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Generate$/ }).click();

  // 4. Reveal dialog appears with a 40-hex-char DRF token in <code>.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8000 });
  await expect(dialog.locator("code")).toHaveText(/^[a-f0-9]{30,}$/);
  // Footer "Close" button — disambiguate from the X (also aria-label=Close).
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  // 5. Row now shows the active marker.
  await expect(row).toContainText("Active");

  // 6. Revoke.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /^Revoke$/ }).click();
  // Row should drop back to no-token state — wait for "Generate" button
  // (or "None" text) to reappear.
  await expect(row.getByRole("button", { name: /^Generate$/ })).toBeVisible({ timeout: 8000 });

  // 7. Cleanup: delete the temp user via /users list -> detail -> Delete user.
  await page.goto(`${SPA}/users?search=${encodeURIComponent(tmpUser)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: tmpUser }).first().click();
  await page.waitForURL(/\/users\/\d+$/, { timeout: 10000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Delete user/ }).click();
  await page.waitForURL(/\/users(\?.*)?$/, { timeout: 10000 });
});
