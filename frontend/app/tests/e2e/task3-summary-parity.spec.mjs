/**
 * Task 3 Summary tab parity (PE-rich sample)
 * ==========================================
 * Locks in the upstream `/analysis/3/` "Quick Overview" pane structure:
 *   Verdict / Analysis Details / Machine Information / File Information
 *   / PE Information / Statistics / Subfile Information.
 *
 * Driven against vanilla CAPE — the SPA falls back to scrape mode for
 * the inline kv (Analysis Details / Machine / File). PE / Statistics /
 * Subfiles only render when the v3 backend feeds them through, so the
 * test gates them on availability rather than failing hard.
 */
import { expect, test } from "@playwright/test";

const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const TASK_ID = Number(process.env.PARITY_TASK3_ID ?? "3");

test(`task ${TASK_ID} Summary tab — Verdict + Analysis Details + File Information present`, async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${SPA}/tasks/${TASK_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const cards = await page.evaluate(() => {
    return [...document.querySelectorAll(".panel .panel-h")].map((h) =>
      (h.textContent || "").trim().split(/\s+·/)[0],
    );
  });
  console.log(`[task${TASK_ID}.cards]`, JSON.stringify(cards));

  // For a real PE sample (task 3 = python-3.8.10.exe) every dimension
  // upstream renders inline must surface in the SPA.
  expect(cards).toEqual(
    expect.arrayContaining([
      "Verdict",
      "Analysis Details",
      "Machine Information",
      "File Information",
      "PE Information",
      "Statistics",
      "Subfile Information",
    ]),
  );

  // Sanity: PE Information must include accordion items (Sections / Imports).
  const peSections = await page.evaluate(() => {
    const peCard = [...document.querySelectorAll(".panel")].find((p) =>
      /^PE Information/.test(p.querySelector(".panel-h")?.textContent ?? ""),
    );
    if (!peCard) return null;
    return [...peCard.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim().split("·")[0].trim())
      .filter(Boolean);
  });
  console.log(`[task${TASK_ID}.pe.accordions]`, JSON.stringify(peSections));
  expect(peSections).not.toBeNull();
  expect(peSections).toEqual(expect.arrayContaining(["Sections", "Imports"]));

  // Sanity: Statistics card must show at least the Processing bucket.
  const statsBuckets = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".panel")].find((p) =>
      /^Statistics/.test(p.querySelector(".panel-h")?.textContent ?? ""),
    );
    if (!card) return [];
    return [...card.querySelectorAll(".dim.mono")]
      .map((el) => (el.textContent || "").trim().split("·")[0].trim())
      .filter(Boolean);
  });
  console.log(`[task${TASK_ID}.stats.buckets]`, JSON.stringify(statsBuckets));
  expect(statsBuckets).toContain("Processing");

  expect(errors).toEqual([]);
});
