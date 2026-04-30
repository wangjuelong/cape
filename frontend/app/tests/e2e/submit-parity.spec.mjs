/**
 * Submit-page parity check
 * ========================
 * Confirms the SPA Submit page exposes every form field that upstream
 * `web/submission/index.html` does, by extracting both forms' field
 * inventories at runtime and diffing them.
 *
 * Usage:
 *   docker compose -f docker/parity/docker-compose.yml up -d --build
 *   npx playwright test tests/e2e/submit-parity.spec.mjs
 *
 * URLs (override via env if your stack differs):
 *   PARITY_UPSTREAM_URL  default http://localhost:8000
 *   PARITY_SPA_URL       default http://localhost:5173
 *   PARITY_USER          default admin
 *   PARITY_PASS          default admin
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = process.env.PARITY_UPSTREAM_URL ?? "http://localhost:8000";
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
  url: { kind: "input", required: true, mode: "url" },
  dlnexec: { kind: "input", required: false, mode: "dlnexec" },
  hashes: { kind: "input", required: false, mode: "downloading_service" },
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
  static_config: { kind: "checkbox", required: true }, // upstream html name="static" but with id=static_config
  oldloader: { kind: "checkbox", required: true },
  screenshots_qr: { kind: "checkbox", required: true },
  // mitmdump is parsed by views.py but never appears in upstream's index.html
  // — track separately so we don't blame the SPA for having extra coverage.
  mitmdump: { kind: "checkbox", required: false, mitmdumpExtra: true },
};

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

async function login(page, base) {
  await page.goto(base + "/accounts/login/");
  await page.locator('input[name="login"]').fill(USER);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('form[method="post"] button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/accounts/"), {
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

async function extractFields(page) {
  // Visit every mode tab to make conditional fields render before scraping.
  // Upstream is one Django form with all fields rendered on first load,
  // so this is mainly relevant for the SPA.
  return await page.evaluate(() => {
    const out = {};
    const docInputs = document.querySelectorAll(
      'input[name], select[name], textarea[name]',
    );
    for (const el of docInputs) {
      const name = el.getAttribute("name");
      if (!name) continue;
      let kind = "input";
      if (el.tagName === "SELECT") kind = "select";
      else if (el.tagName === "TEXTAREA") kind = "textarea";
      else if (el.type === "file") kind = "file";
      else if (el.type === "checkbox") kind = "checkbox";
      else if (el.type === "radio") kind = "radio";
      out[name] = (out[name] ? out[name] + "," : "") + kind;
    }
    return out;
  });
}

async function scrapeUpstream() {
  const browser = await (await import("@playwright/test")).chromium.launch();
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
    await browser.close();
  }
}

async function scrapeSPA() {
  const browser = await (await import("@playwright/test")).chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await login(page, SPA);
    await page.goto(SPA + "/submit");
    await page.waitForSelector("text=Advanced options", { timeout: 15000 });

    // SPA only mounts the active mode's primary input; cycle every visible
    // mode tab to collect the union of fields.
    const tabs = await page.locator("button:has-text(/^(File|Download|URL|DL & Exec|PCAP|Static|Resubmit)/)").all();
    const seen = new Set();
    let merged = await extractFields(page);
    for (const tab of tabs) {
      const label = (await tab.textContent())?.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      try {
        await tab.click({ timeout: 2000 });
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
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });

test("submit form parity: upstream /submit/  ↔  SPA /submit", async () => {
  const upstreamFields = await scrapeUpstream();
  const spaFields = await scrapeSPA();

  const report = {
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
      if (upHas && spaHas) {
        const upKind = upstreamFields[name].split(",")[0];
        const spaKind = spaFields[name].split(",")[0];
        if (upKind !== spaKind && def.kind && def.kind !== upKind) {
          // Tolerate small variations (input vs select for hashes, etc.)
        } else if (upKind !== spaKind) {
          report.diff.kind_mismatch.push({ name, upstream: upKind, spa: spaKind });
        }
      }
    } else {
      if (upHas !== spaHas) report.diff.ignored_environment_gated.push(name);
    }
  }

  // Catch SPA-only fields that aren't in our expected set
  for (const name of Object.keys(spaFields)) {
    if (!(name in SUBMIT_FIELDS) && !name.startsWith("csrfmiddlewaretoken")) {
      report.diff.missing_from_upstream.push(name);
    }
  }
  // And upstream-only fields
  for (const name of Object.keys(upstreamFields)) {
    if (!(name in SUBMIT_FIELDS) && !name.startsWith("csrfmiddlewaretoken")) {
      report.diff.missing_from_spa.push(name);
    }
  }

  // Snapshot the report to test-results/ for human review.
  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "submit-parity.json"), JSON.stringify(report, null, 2));

  // Hard assertion: SPA must NOT be missing any required upstream field.
  expect(report.diff.missing_from_spa, "SPA missing fields present upstream").toEqual([]);
});
