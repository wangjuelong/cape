/**
 * Display-completeness parity check
 * =================================
 * After the Recent / task-detail "数据显示不全" fix, lock in:
 *
 *   1. Recent Timestamp cell renders the full `YYYY-MM-DD HH:MM:SS` (19
 *      chars) without scroll-clipping.
 *   2. Task detail Summary tab includes the "Analysis Details" and
 *      "File Information" cards we mirror from upstream.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const TASK_ID = Number(process.env.PARITY_TASK_ID ?? "1");

test("Recent Timestamp cell does not truncate", async ({ page }) => {
  await page.goto(`${SPA}/recent`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  const cell = await page.evaluate(() => {
    const tr = document.querySelector("table.data tbody tr");
    if (!tr) return null;
    const tds = [...tr.querySelectorAll("td")];
    const ts = tds[1];
    if (!ts) return null;
    return {
      text: (ts.textContent || "").trim(),
      scrollWidth: ts.scrollWidth,
      clientWidth: ts.clientWidth,
      truncated: ts.scrollWidth > ts.clientWidth + 1,
    };
  });
  console.log("[recent.ts]", JSON.stringify(cell));
  expect(cell, "First Recent row must render").not.toBeNull();
  expect(cell.text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(cell.truncated, "Timestamp must not be truncated").toBe(false);
});

test(`task detail Summary shows Analysis Details + File Information`, async ({ page }) => {
  await page.goto(`${SPA}/tasks/${TASK_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const cards = await page.evaluate(() => {
    return [...document.querySelectorAll(".panel .panel-h")].map((h) =>
      (h.textContent || "").trim().split(/\s+·/)[0],
    );
  });
  console.log("[detail.cards]", JSON.stringify(cards));
  expect(cards).toEqual(expect.arrayContaining(["Verdict", "Analysis Details", "File Information"]));
});
