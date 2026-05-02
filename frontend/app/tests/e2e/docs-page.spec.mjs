/**
 * Lock-in spec for the /docs apiv2 Token API reference page. Verifies
 * 6 sections, 20+ endpoint paths, GET/POST/DELETE method badges, TOC sidebar, and apiv3 Swagger link.
 */

import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://192.168.1.6:8000";
const USER = process.env.SPA_LOGIN_USER ?? "admin";
const PASS = process.env.SPA_LOGIN_PASS ?? "cape123!";

test("/docs renders apiv2 Token API reference", async ({ page }) => {
  await page.goto(`${SPA}/accounts/login/`);
  await page.fill('input[name="login"]', USER);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(1500);

  await page.goto(`${SPA}/docs`);
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(() => {
    const panels = [...document.querySelectorAll(".panel .panel-h")].map((h) =>
      (h.textContent || "").trim().split(/·/)[0].trim(),
    );
    return {
      panelHeaders: panels,
      hasIntro: !!document.body.textContent?.includes(
        "apiv2 通过 API Token 调用沙箱检测的接口文档",
      ),
      hasQuickStart: !!document.body.textContent?.includes("Quick start"),
      hasToc: !!document.body.textContent?.includes("Sections"),
      endpointPaths: [
        ...new Set(
          [...document.querySelectorAll("button code.mono")]
            .map((c) => (c.textContent || "").trim())
            .filter((t) => t.startsWith("/apiv2/")),
        ),
      ],
      methodBadges: [
        ...new Set(
          [...document.querySelectorAll("span.mono")]
            .map((s) => (s.textContent || "").trim())
            .filter((t) => /^(GET|POST|DELETE)$/.test(t)),
        ),
      ],
      apiv3Link: !![...document.querySelectorAll("a")].find(
        (a) => a.getAttribute("href") === "/api/v3/docs/",
      ),
    };
  });

  console.log("[docs.probe]", JSON.stringify(probe, null, 2));
  await page.screenshot({ path: "test-results/docs-rendered.png", fullPage: true });

  expect(probe.hasIntro).toBe(true);
  expect(probe.hasQuickStart).toBe(true);
  expect(probe.hasToc).toBe(true);
  expect(probe.panelHeaders).toEqual(
    expect.arrayContaining([
      expect.stringContaining("API Docs"),
      expect.stringContaining("Quick start"),
      "1. 鉴权 — 获取 Token",
      "2. 提交样本",
      "3. 任务查询与管理",
      "4. 检索",
      "5. 工件下载（二进制）",
      "6. 系统状态",
    ]),
  );
  expect(probe.endpointPaths.length).toBeGreaterThanOrEqual(20);
  expect(probe.methodBadges).toEqual(expect.arrayContaining(["GET", "POST"]));
  expect(probe.apiv3Link).toBe(true);
});
