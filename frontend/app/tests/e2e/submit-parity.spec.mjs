/**
 * Submit-page parity check
 * ========================
 * Confirms the SPA's /submit page exposes every form field that an
 * upstream CAPEv2 deployment renders at /submit/, by extracting both
 * forms' field inventories at runtime and diffing them.
 *
 * Defaults compare:
 *   PARITY_UPSTREAM_URL  http://192.168.1.6:8000  (reference CAPE deploy)
 *   PARITY_SPA_URL       http://localhost:5173    (this fork's Vite dev)
 *
 * Override via env if your stack lives elsewhere. PARITY_USER/PASS only
 * matter when the deployment has web_auth enabled — otherwise the spec
 * silently browses anonymously.
 *
 * Usage:
 *   npx playwright test tests/e2e/submit-parity.spec.mjs --reporter=line
 *
 * Output:
 *   test-results/submit-parity.json — full field manifest + diff
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://192.168.1.6:8000";
const SPA = process.env.PARITY_SPA_URL ?? "http://localhost:5173";
const USER = process.env.PARITY_USER ?? "admin";
const PASS = process.env.PARITY_PASS ?? "admin";

/* The fields upstream's `views.py:parse_request_arguments()` + the 17
 * extended-capabilities checkboxes accept. Keys are POST field names; the
 * boolean tells whether absence of the field on EITHER side is a real gap
 * vs an environment-config thing.
 *
 * "required: true"  → must be present in both forms (otherwise FAIL)
 * "required: false" → may be hidden by config flags upstream (warn-only)
 */
const SUBMIT_FIELDS = {
  // Mode-specific inputs
  sample: { kind: "file", required: true, mode: "file" },
  url: { kind: "input", required: false, mode: "url" }, // gated by web.conf [url_analysis]
  dlnexec: { kind: "input", required: false, mode: "dlnexec" }, // gated by web.conf [dlnexec]
  hashes: { kind: "input", required: false, mode: "downloading_service" }, // gated
  pcap: { kind: "file", required: true, mode: "pcap" },
  static: { kind: "file", required: true, mode: "static" },

  // 18 shared parameters
  package: { kind: "select", required: true },
  timeout: { kind: "input", required: true },
  priority: { kind: "select", required: true },
  options: { kind: "input", required: true },
  machine: { kind: "select", required: true },
  tags: { kind: "input", required: false },
  tags_tasks: { kind: "input", required: true },
  custom: { kind: "input", required: true },
  clock: { kind: "input", required: true },
  route: { kind: "select", required: true },
  tlp: { kind: "select", required: false },
  lin_options: { kind: "input", required: false },
  pre_script: { kind: "file", required: false },
  during_script: { kind: "file", required: false },
  job_category: { kind: "select", required: false, mode: "resubmit" },
  hash: { kind: "input", required: false, mode: "resubmit" },

  // 17 extended-capability checkboxes
  process_dump: { kind: "checkbox", required: true },
  process_memory: { kind: "checkbox", required: false },
  amsidump: { kind: "checkbox", required: false },
  import_reconstruction: { kind: "checkbox", required: true },
  memory: { kind: "checkbox", required: false },
  enforce_timeout: { kind: "checkbox", required: true },
  free: { kind: "checkbox", required: true },
  unpacker: { kind: "checkbox", required: true },
  syscall: { kind: "checkbox", required: true },
  norefer: { kind: "checkbox", required: true },
  nohuman: { kind: "checkbox", required: true },
  interactive: { kind: "checkbox", required: false },
  manual: { kind: "checkbox", required: false },
  kernel_analysis: { kind: "checkbox", required: false },
  static_config: { kind: "checkbox", required: true }, // upstream html name="static" with id=static_config
  oldloader: { kind: "checkbox", required: true },
  screenshots_qr: { kind: "checkbox", required: true },
  // mitmdump is parsed by views.py but never appears in upstream's index.html
  // — track separately so we don't blame the SPA for having extra coverage.
  mitmdump: { kind: "checkbox", required: false, mitmdumpExtra: true },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page, base) {
  // Some CAPE deployments disable web_auth; in that case /submit/ renders
  // directly and /accounts/login/ may even 500. Try to log in but fall back
  // to anonymous browsing if the login form isn't there.
  try {
    const resp = await page.goto(base + "/accounts/login/", { timeout: 8000 });
    if (!resp || resp.status() >= 500) {
      console.log(`[parity] ${base} login disabled (HTTP ${resp?.status()}), continuing anonymously`);
      return;
    }
    const loginInput = page.locator('input[name="login"]').first();
    const visible = await loginInput.isVisible().catch(() => false);
    if (!visible) {
      console.log(`[parity] ${base} no login form, continuing anonymously`);
      return;
    }
    await loginInput.fill(USER);
    await page.locator('input[name="password"]').fill(PASS);
    await page.locator('form[method="post"] button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/accounts/"), {
      timeout: 15000,
    });
  } catch (err) {
    console.log(`[parity] ${base} login skipped: ${err.message}`);
  }
}

/** Names of inputs that aren't part of the submission form proper
 *  (CSRF token, navbar search box, etc) and should never count toward the
 *  parity diff. */
const FIELD_NAME_BLOCKLIST = new Set([
  "csrfmiddlewaretoken",
  "search", // navbar regex search
]);

async function extractFields(page) {
  const blocklist = Array.from(FIELD_NAME_BLOCKLIST);
  return await page.evaluate((blockedNames) => {
    /** @type {Record<string, string>} */
    const out = {};
    const blocked = new Set(blockedNames);
    // Restrict to the actual submission <form> if one is present so we don't
    // pick up navbar widgets that share an input name (eg. upstream's regex
    // search input also named name=…).
    const root =
      document.querySelector("form[method='post']") ||
      document.querySelector("form") ||
      document.body;
    const docInputs = root.querySelectorAll(
      "input[name], select[name], textarea[name]",
    );
    for (const el of docInputs) {
      const name = el.getAttribute("name");
      if (!name || blocked.has(name)) continue;
      let kind = "input";
      if (el.tagName === "SELECT") kind = "select";
      else if (el.tagName === "TEXTAREA") kind = "textarea";
      else if (el.type === "file") kind = "file";
      else if (el.type === "checkbox") kind = "checkbox";
      else if (el.type === "radio") kind = "radio";
      out[name] = (out[name] ? out[name] + "," : "") + kind;
    }
    return out;
  }, blocklist);
}

async function scrapeUpstream(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page, UPSTREAM);
    await page.goto(UPSTREAM + "/submit/");
    // Bootstrap pills hide tab panes via CSS but the inputs stay in the DOM,
    // so a single scrape captures them all.
    return await extractFields(page);
  } finally {
    await ctx.close();
  }
}

async function scrapeSPA(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page, SPA);
    await page.goto(SPA + "/submit");
    await page.waitForSelector("text=Advanced options", { timeout: 15000 });

    // SPA only mounts the active mode's primary input; cycle every visible
    // mode tab to collect the union of fields.
    const tabs = page.getByRole("button", { name: /^(File\(s\)|Download|URL|DL & Exec|PCAP|Static|Resubmit)/ });
    const labels = await tabs.allTextContents();
    let merged = await extractFields(page);
    for (const raw of labels) {
      const label = raw.trim();
      try {
        await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 2000 });
        await page.waitForTimeout(150);
      } catch {
        continue;
      }
      const here = await extractFields(page);
      merged = { ...merged, ...here };
    }
    return merged;
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test("submit form parity: upstream /submit/  ↔  SPA /submit", async ({ browser }) => {
  const upstreamFields = await scrapeUpstream(browser);
  const spaFields = await scrapeSPA(browser);

  const report = {
    upstream_url: UPSTREAM,
    spa_url: SPA,
    upstream_fields: upstreamFields,
    spa_fields: spaFields,
    expected: SUBMIT_FIELDS,
    diff: {
      missing_from_spa: [],
      missing_from_upstream: [],
      kind_mismatch: [],
      ignored_environment_gated: [],
    },
  };

  for (const [name, def] of Object.entries(SUBMIT_FIELDS)) {
    const upHas = name in upstreamFields;
    const spaHas = name in spaFields;

    if (def.required) {
      if (upHas && !spaHas) report.diff.missing_from_spa.push(name);
      if (spaHas && !upHas) report.diff.missing_from_upstream.push(name);
    } else if (upHas !== spaHas) {
      report.diff.ignored_environment_gated.push({ field: name, upstream: upHas, spa: spaHas });
    }
  }

  // Catch upstream-only fields that aren't in our expected set
  for (const name of Object.keys(upstreamFields)) {
    if (
      !(name in SUBMIT_FIELDS) &&
      !FIELD_NAME_BLOCKLIST.has(name) &&
      !report.diff.missing_from_spa.includes(name)
    ) {
      if (!(name in spaFields)) report.diff.missing_from_spa.push(name);
    }
  }
  for (const name of Object.keys(spaFields)) {
    if (
      !(name in SUBMIT_FIELDS) &&
      !FIELD_NAME_BLOCKLIST.has(name) &&
      !report.diff.missing_from_upstream.includes(name)
    ) {
      if (!(name in upstreamFields)) report.diff.missing_from_upstream.push(name);
    }
  }

  // Snapshot the report to test-results/ for human review.
  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "submit-parity.json"), JSON.stringify(report, null, 2));

  console.log(`[parity] upstream fields: ${Object.keys(upstreamFields).length}`);
  console.log(`[parity] SPA fields: ${Object.keys(spaFields).length}`);
  console.log(`[parity] missing from SPA: ${JSON.stringify(report.diff.missing_from_spa)}`);
  console.log(`[parity] missing from upstream: ${JSON.stringify(report.diff.missing_from_upstream)}`);
  console.log(`[parity] env-gated diff: ${report.diff.ignored_environment_gated.length} fields`);

  // Hard assertion: SPA must NOT be missing any required upstream field.
  expect(report.diff.missing_from_spa, "SPA missing fields present upstream").toEqual([]);
});
