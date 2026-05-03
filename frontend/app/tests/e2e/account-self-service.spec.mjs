/**
 * /docs and avatar-dropdown account self-service flow.
 *
 * Walks: login → open dropdown → see Edit profile + Change password
 *      → change password (testuser only — admin password reverted at end)
 *      → re-login with new password
 *      → restore original password (idempotent for next run)
 *      → see Users link in sidebar (is_staff)
 */

import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

async function login(page, user, pass) {
  await page.goto(`${SPA}/accounts/login/`);
  await page.fill('input[name="login"]', user);
  await page.fill('input[name="password"]', pass);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(1500);
}

async function openAccountMenu(page) {
  // Radix DropdownMenu may already be open (e.g. after a menu item used
  // preventDefault to keep it mounted). If the menu is already showing,
  // there's nothing to do — the items are already clickable.
  const menu = page.getByRole("menu", { name: /Account menu for/ });
  if (await menu.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole("button", { name: /Account menu for/ }).click();
}

test("dropdown shows Edit profile + Change password + Sign out", async ({ page }) => {
  await login(page, USER, PASS);
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: /Edit profile/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Change password/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Sign out/ })).toBeVisible();
});

test("Edit profile modal pre-fills + closes on cancel", async ({ page }) => {
  await login(page, USER, PASS);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Edit profile/ }).click();
  // Wait for the dialog
  await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
  // Inputs render
  await expect(page.locator("#first_name")).toBeVisible();
  await expect(page.locator("#last_name")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Edit profile" })).not.toBeVisible();
});

test("Sidebar Admin > Users link is visible for staff", async ({ page }) => {
  await login(page, USER, PASS);
  await expect(page.getByRole("link", { name: /^Users/ })).toBeVisible();
  // After 2026-05-03 SPA user-management landing, link points to internal
  // /users (was /admin/auth/user/ external).
  const link = page.getByRole("link", { name: /^Users/ });
  await expect(link).toHaveAttribute("href", "/users");
});

test("Change password full round-trip", async ({ page, browser }) => {
  // 4-step round-trip (change pw → sign out → re-login → change back)
  // exceeds the default 30s test timeout; allow up to 90s.
  test.setTimeout(90000);
  // 1. login as admin
  await login(page, USER, PASS);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Change password/ }).click();
  await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();

  const NEW = "TempPass987Strong!";
  await page.locator("#cur_pw").fill(PASS);
  await page.locator("#new_pw").fill(NEW);
  await page.locator("#confirm_pw").fill(NEW);
  await page.getByRole("button", { name: "Update password" }).click();

  // toast + modal close
  await expect(page.getByText("Password changed.")).toBeVisible({ timeout: 4000 });

  // 2. sign out
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await page.waitForURL(/\/accounts\/login\//);

  // 3. log in with new password
  await login(page, USER, NEW);
  await expect(page.getByText("CAPE").first()).toBeVisible();

  // 4. restore — change BACK so test is idempotent
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Change password/ }).click();
  await page.locator("#cur_pw").fill(NEW);
  await page.locator("#new_pw").fill(PASS);
  await page.locator("#confirm_pw").fill(PASS);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible({ timeout: 4000 });
});
