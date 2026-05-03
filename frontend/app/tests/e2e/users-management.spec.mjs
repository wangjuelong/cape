/**
 * /users SPA management surface — list / detail tabs / token round-trip.
 *
 * Uses an EPHEMERAL test user `e2e-tmp` to avoid disturbing admin/cuckoo
 * setup. The test creates the user, exercises every tab, then deletes it.
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
  const url = page.url();
  const userId = Number(url.match(/\/users\/(\d+)$/)?.[1]);

  // 2. Basic tab — change first_name → save.
  // BasicTab inputs (in <main>): 0=username (readonly), 1=email, 2=first_name, 3=last_name
  await page.locator('main input:not([type="checkbox"])').nth(2).fill("E2E");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("User updated.")).toBeVisible({ timeout: 4000 });

  // 3. API Token tab — generate
  await page.getByRole("button", { name: "API Token" }).click();
  await page.getByRole("button", { name: /Generate token/ }).click();
  await expect(page.getByText("Token generated/rotated.")).toBeVisible({ timeout: 4000 });

  // 4. Delete user (cleanup)
  await page.getByRole("button", { name: "Basic" }).click();
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

test("/users/<id> History tab loads audit events for admin", async ({ page }) => {
  await login(page);
  // Navigate to admin's own detail page through the list (more robust than
  // hard-coding /users/1).
  await page.goto(`${SPA}/users?search=${encodeURIComponent(USER)}`);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: USER }).first().click();
  await page.waitForURL(/\/users\/\d+/, { timeout: 10000 });

  // Click the History tab.
  await page.getByRole("button", { name: "History" }).click();

  // Wait for either an AuditTable row OR the empty-state copy. Admin
  // has had several audit events generated during sub-spec #1/#2/#3
  // implementation, so the table path is the realistic one — but we
  // accept either to keep the test robust against fresh deployments.
  await page.waitForFunction(
    () => {
      const rows = document.querySelectorAll("table.data tbody tr");
      const empty = Array.from(document.querySelectorAll("div"))
        .some((d) => /No audit events recorded/i.test(d.textContent ?? ""));
      return rows.length > 0 || empty;
    },
    { timeout: 8000 },
  );

  // Either branch is acceptable; assert at least one is true.
  const rows = await page.locator("table.data tbody tr").count();
  if (rows === 0) {
    await expect(
      page.getByText(/No audit events recorded for this user yet/),
    ).toBeVisible();
  } else {
    expect(rows).toBeGreaterThan(0);
  }
});
