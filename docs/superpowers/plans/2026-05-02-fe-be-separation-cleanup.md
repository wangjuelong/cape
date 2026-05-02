# FE/BE 完全分离清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除上游 Bootstrap 模板及 SPA 的 server-rendered HTML 兜底路径，使 SPA 仅通过 `/api/v3/*` 与后端通信，达成代码物理分离。零功能变更（用户可见行为、apiv2 token API、CSS/JS 视觉、二进制下载链路全部不动）。

**Architecture:** 4-phase delete-only refactor in dependency order. **Phase A** removes FE scrape fallback (gated by apiv3 shape diff audit). **Phase B** closes BE URL routes. **Phase C** deletes templates + static. **Phase D** surgically removes Python view code. Each phase commits independently and is independently revertable.

**Tech Stack:** Django 5.1, DRF, drf-spectacular, React 18, Vite 6, TanStack Query, Playwright. Branch: `refactor/web-spa`.

---

## Pre-flight

### Task 0: Branch + baseline e2e

**Files:**
- Read: `frontend/app/tests/e2e/*.spec.mjs` (no edit; just inventory)

- [ ] **Step 1: Confirm branch + clean tree**

```bash
cd /Users/lamba/github/cape
git status
git branch --show-current
```

Expected: branch = `refactor/web-spa`, tree clean (or only this plan file uncommitted).

- [ ] **Step 2: Inventory existing e2e specs**

```bash
ls frontend/app/tests/e2e/
```

Expected output to include at minimum: `audit-log.spec.mjs`, plus existing specs covering Recent / Submit / Compare / Search / Statistics / Tasks (per session history). Note the list — these are the verification surface for every phase.

- [ ] **Step 3: Capture baseline screenshot of /audit + /recent on 192.168.1.6**

```bash
cd frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 npx playwright test tests/e2e/audit-log.spec.mjs --reporter=line
```

Expected: `3 passed`. Save the test-results screenshot path for later visual comparison.

- [ ] **Step 4: Snapshot file counts (sanity baseline)**

```bash
echo "templates:";   find web/templates -type f | wc -l
echo "static-css:";  find web/static/css -type f 2>/dev/null | wc -l
echo "static-js:";   find web/static/js -type f 2>/dev/null | wc -l
echo "scrape-mods:"; ls frontend/app/src/lib/api/upstream-*.ts | wc -l
```

Record numbers — Phase D should be substantially lower.

- [ ] **Step 5: No commit needed**

This is observation only.

---

## Phase A — Frontend scrape removal

### Task A0: apiv3 shape diff audit

**Files:**
- Create: `docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md`
- Read: 8 SPA hooks + their corresponding apiv3 view + serializer

**Background:** Each hook follows `try { fetchApiv3() } catch { adapt(scrape()) }`. If apiv3 returns less data than `adapt(scrape())`, removing the catch will leak missing fields into UI rendering. This audit produces the exact gap list so Phase A removal tasks can fix gaps in the same commit they remove fallback.

- [ ] **Step 1: Create audit skeleton**

```bash
mkdir -p docs/superpowers/audits
cat > docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md <<'EOF'
# apiv3 Shape Diff Audit — 2026-05-02

Per-hook comparison of `try { apiv3 }` vs `catch { adapt(scrape()) }` return shapes.
Output column **GAP** = "" (no gap), "BE" (apiv3 missing fields → fix in apiv3), "FE" (drop SPA-side field; not used downstream), "TYPE" (same fields but type differs).

## 1. useReportSummary (`/api/v3/reports/<id>/summary/`)

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|

## 2. useReportTabs

## 3. useBehavior (`/api/v3/reports/<id>/behavior/`)

## 4. useCompareCandidates (`/api/v3/compare/<l>/`)

## 5. useCompareDiff (`/api/v3/compare/<l>/<r>/`)

## 6. useSearch (`/api/v3/search/`)

## 7. useStatistics (`/api/v3/statistics/<days>/`)

## 8. useSubmissionForm (`/api/v3/system/submission-form/`)

## Summary of BE fixes required

Bullet list of apiv3 modifications needed before scrape can be removed.
EOF
```

- [ ] **Step 2: Audit useReportSummary**

Read these files and fill row-by-row:
- `frontend/app/src/hooks/useReport.ts`
- `frontend/app/src/lib/api/reports.ts` (for `ReportSummary` TS interface)
- `frontend/app/src/lib/api/upstream-report-scrape.ts` (specifically `asReportSummary()`)
- `web/apiv3/views.py` lines 689-716 (`report_summary` view)
- `web/apiv3/serializers.py` (search for `ReportSummarySerializer`)

For every key in `ReportSummary`, mark whether apiv3 actually provides it. Common fields to verify: `task`, `available_sections`, `tab_counts`, `signatures`, `score`, `severity`, `verdict`, `family`, `analysis_info`, `machine_info`, `file_info`, `pe_info`, `statistics_processing`, `subfiles`.

- [ ] **Step 3: Audit useReportTabs**

Read `frontend/app/src/hooks/useReportTabs.ts` and identify every endpoint+adapter it composes (it likely calls multiple apiv3 endpoints + the same scrape result). Verify each.

- [ ] **Step 4: Audit useBehavior**

Compare:
- `frontend/app/src/lib/api/reports.ts` (`BehaviorSummary` type)
- `frontend/app/src/lib/api/upstream-report-scrape.ts` `asBehaviorReport()` (returns `{platform: null, processtree: [], processes: []}` — degenerate)
- `web/apiv3/views.py` `report_behavior` (line 733-739)
- `BehaviorSummaryResponseSerializer`

Note: scrape's `asBehaviorReport` is intentionally degenerate (Behavior tab is server-side lazy-loaded over CSRF-protected POST). Confirm apiv3 produces real behavior data so removing the degenerate fallback is strictly an improvement.

- [ ] **Step 5: Audit useCompareCandidates + useCompareDiff**

Compare:
- `frontend/app/src/hooks/useCompare.ts`
- `frontend/app/src/lib/api/upstream-compare-scrape.ts`
- `web/apiv3/views.py` lines 305-360 (`compare_candidates`, `compare_diff`)

The `_counts` and `summary` maps in compare_diff scrape are filled best-effort — likely apiv3 has the canonical data. Verify.

- [ ] **Step 6: Audit useSearch**

Compare:
- `frontend/app/src/hooks/useSearch.ts`
- `frontend/app/src/lib/api/upstream-search-scrape.ts` `parseUpstreamSearchHtml()`
- `web/apiv3/views.py` lines 230-247 (`search`)
- `SearchResponseSerializer`

Verify shape including `ok`, `term`, `raw`, `error`, `items` (TaskSummary[]).

- [ ] **Step 7: Audit useStatistics**

Compare:
- `frontend/app/src/hooks/useStatistics.ts`
- `frontend/app/src/lib/api/upstream-statistics-scrape.ts` `StatisticsScrape` interface
- `web/apiv3/views.py` lines 283-305 (`statistics`)

Verify: `days`, `total`, `average`, `tasks_per_day`, `processing`, `signatures`, `reporting`, `custom_statistics`, `top_samples`, `detections`, `asns`, `distributed_tasks`.

- [ ] **Step 8: Audit useSubmissionForm**

Compare:
- `frontend/app/src/hooks/useSubmissionForm.ts` (with `adaptScrapeToFormData` — already lossy)
- `web/apiv3/views.py` lines 201-205 (`submission_form_data`)
- `SubmissionFormDataSerializer`

Verify shape: `packages[]`, `machines[]`, `machine_tags[]`, `route_options[]`, `random_route`, `default_route`, `config{}`.

- [ ] **Step 9: Write Summary section**

In the audit doc's **Summary of BE fixes required** section, list each gap with this format:

```
- [BE] /api/v3/reports/<id>/summary/ — ReportSummarySerializer missing field `pe_info.imports[].functions[].address` → fix in web/apiv3/serializers.py + web/apiv3/services/report_service.py
- [TYPE] /api/v3/search/ — apiv3 returns `submitted` as ISO string, scrape returns "" — no action (apiv3 is correct, scrape was lossy)
```

If no gaps: write `**No BE fixes required.** All 8 hooks can drop fallback in their respective tasks without apiv3 changes.`

- [ ] **Step 10: Commit audit doc**

```bash
git add docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md
git commit -m "docs(audit): apiv3 shape diff vs scrape adapters"
```

**GATE:** This audit MUST be reviewed before A1 starts. If it lists BE fixes, those fixes must be applied (in the corresponding hook's removal task — see A1-A8 step 1).

---

### Task A1: useReportSummary — apply BE fix (if any) + remove fallback

**Files:**
- Read: `docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md` § 1
- Modify (conditional): `web/apiv3/serializers.py`, `web/apiv3/services/report_service.py` (if § 1 lists `[BE]` gaps)
- Modify: `frontend/app/src/hooks/useReport.ts`

- [ ] **Step 1: Apply any apiv3 BE fixes flagged for useReportSummary**

If the audit § 1 lists `[BE]` rows, edit the apiv3 serializer/service to populate the missing fields. Do not skip a `[BE]` gap — every one must be resolved before the scrape fallback can come out, because the fallback is the only thing currently filling that field.

If the audit § 1 has no `[BE]` rows, skip this step.

- [ ] **Step 2: If BE was modified, smoke-test it**

```bash
sudo -u cape /opt/CAPEv2/.venv/bin/python /opt/CAPEv2/web/manage.py runserver 0:8001 &
curl -s -b "sessionid=<copy from browser>" http://localhost:8001/api/v3/reports/3/summary/ | jq 'keys'
```

Expected: keys list now includes the previously-missing fields. Kill server.

- [ ] **Step 3: Remove the fallback in useReport.ts**

Replace the file contents:

```typescript
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchReportSummary, type ReportSummary } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

/**
 * Fetch a task's report summary via /api/v3/reports/<id>/summary/.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useReportSummary(taskId: number): UseQueryResult<ReportSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.summary(taskId),
    queryFn: () => fetchReportSummary(taskId),
    staleTime: 30_000,
    retry: 0,
  });
}
```

- [ ] **Step 4: Typecheck + build**

```bash
cd frontend/app && npm run typecheck && npm run build
```

Expected: 0 errors. The `upstream-report-scrape` import disappears from this file's compiled output.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/hooks/useReport.ts \
        $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useReportSummary"
```

---

### Task A2: useReportTabs — apply BE fix (if any) + remove fallback

**Files:**
- Read: audit § 2
- Modify (conditional): `web/apiv3/...`
- Modify: `frontend/app/src/hooks/useReportTabs.ts`

- [ ] **Step 1: Read audit § 2 + the current hook**

```bash
cat frontend/app/src/hooks/useReportTabs.ts
```

Note all `try/catch` fallback branches — each will be removed.

- [ ] **Step 2: Apply BE fixes if § 2 lists any**

Same protocol as A1 step 1.

- [ ] **Step 3: Remove fallback branches**

For every `try { fetchXxx() } catch { return adapter(scraped); }` block: simplify to `return await fetchXxx();`. Drop the `import` of `upstream-report-scrape` adapters.

- [ ] **Step 4: Typecheck + build**

```bash
cd frontend/app && npm run typecheck && npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/hooks/useReportTabs.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useReportTabs"
```

---

### Task A3: useBehavior — remove fallback

**Files:**
- Read: audit § 3
- Modify: `frontend/app/src/hooks/useBehavior.ts`

Note: scrape's `asBehaviorReport` is degenerate (returns empty processtree). apiv3 already authoritative.

- [ ] **Step 1: Apply BE fixes if § 3 lists any (unlikely)**

Skip if no `[BE]` rows.

- [ ] **Step 2: Remove fallback**

Replace `try { fetchBehavior } catch { asBehaviorReport(await fetchUpstreamReport(taskId)) }` with the direct call:

```typescript
queryFn: () => fetchBehavior(taskId)
```

Drop the `upstream-report-scrape` import.

- [ ] **Step 3: Typecheck + build**

```bash
cd frontend/app && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/hooks/useBehavior.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useBehavior"
```

---

### Task A4: useCompare — remove fallback

**Files:**
- Read: audit §§ 4, 5
- Modify: `frontend/app/src/hooks/useCompare.ts`

- [ ] **Step 1: Apply BE fixes if §§ 4 or 5 list any**

Skip if no `[BE]`.

- [ ] **Step 2: Remove fallback in both hooks** (`useCompareCandidates` and `useCompareDiff`)

Replace each `try { fetchCompareXxx } catch { ... fetchUpstreamCompareXxx ... }` with the direct apiv3 call. Drop both `fetchUpstreamCompareCandidates` and `fetchUpstreamCompareDiff` imports.

- [ ] **Step 3: Typecheck + build**

```bash
cd frontend/app && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/hooks/useCompare.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useCompare"
```

---

### Task A5: useSearch — remove fallback

**Files:**
- Read: audit § 6
- Modify: `frontend/app/src/hooks/useSearch.ts`

- [ ] **Step 1: Apply BE fixes if § 6 lists any**

- [ ] **Step 2: Remove fallback**

Replace the `try { ... } catch { fetchUpstreamSearchScrape(...) }` body with the direct apiv3 call. Drop the `upstream-search-scrape` import.

- [ ] **Step 3: Typecheck + build**

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/hooks/useSearch.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useSearch"
```

---

### Task A6: useStatistics — remove fallback

**Files:**
- Read: audit § 7
- Modify: `frontend/app/src/hooks/useStatistics.ts`

- [ ] **Step 1: Apply BE fixes if § 7 lists any**

- [ ] **Step 2: Remove fallback**

Same pattern as A5 — drop the `try/catch`, call apiv3 directly. Drop `upstream-statistics-scrape` import.

- [ ] **Step 3: Typecheck + build**

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/hooks/useStatistics.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useStatistics"
```

---

### Task A7: useSubmissionForm — remove fallback

**Files:**
- Read: audit § 8
- Modify: `frontend/app/src/hooks/useSubmissionForm.ts`

- [ ] **Step 1: Apply BE fixes if § 8 lists any**

The `adaptScrapeToFormData` function in this hook is the most lossy adapter — it papers over many missing fields. Audit must be especially careful here.

- [ ] **Step 2: Remove fallback + adapter helper**

Replace the entire file with:

```typescript
import { useQuery } from "@tanstack/react-query";

import { fetchSubmissionFormData, type SubmissionFormData } from "@/lib/api/submission-form";
import { queryKeys } from "@/lib/query-keys";

/**
 * Loads the submit page's dropdown / config metadata via
 * /api/v3/system/submission-form/.
 *
 * The previous "scrape upstream /submit/ HTML on apiv3 failure" fallback
 * has been removed — apiv3 is now authoritative.
 */
export function useSubmissionForm() {
  return useQuery<SubmissionFormData>({
    queryKey: queryKeys.system.submissionForm,
    queryFn: () => fetchSubmissionFormData(),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
```

- [ ] **Step 3: Typecheck + build**

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/hooks/useSubmissionForm.ts $(git diff --name-only web/apiv3/ 2>/dev/null)
git commit -m "refactor(spa): drop scrape fallback from useSubmissionForm"
```

---

### Task A8: useAnalysisScrape — full deletion

**Files:**
- Delete: `frontend/app/src/hooks/useAnalysisScrape.ts`
- Modify: any file importing it (search first)

- [ ] **Step 1: Find all importers**

```bash
grep -rn "useAnalysisScrape\|useAnalysis " frontend/app/src/ | grep -v useAnalysisScrape.ts
```

Expected per session history: nothing or only `useTasks` already covers callers. If any active import exists, re-route it to `useTasks` (already working alternative) before deletion.

- [ ] **Step 2: Delete the hook**

```bash
rm frontend/app/src/hooks/useAnalysisScrape.ts
```

- [ ] **Step 3: Search for orphan imports**

```bash
cd frontend/app && grep -rn "useAnalysisScrape" src/
```

Expected: no output.

- [ ] **Step 4: Typecheck + build**

```bash
npm run typecheck && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A frontend/app/src/hooks/
git commit -m "refactor(spa): delete dead useAnalysisScrape hook"
```

---

### Task A9: Delete 7 upstream-*-scrape modules

**Files:**
- Delete:
  - `frontend/app/src/lib/api/upstream-scrape.ts`
  - `frontend/app/src/lib/api/upstream-report-scrape.ts`
  - `frontend/app/src/lib/api/upstream-compare-scrape.ts`
  - `frontend/app/src/lib/api/upstream-search-scrape.ts`
  - `frontend/app/src/lib/api/upstream-statistics-scrape.ts`
  - `frontend/app/src/lib/api/upstream-analysis-scrape.ts`
  - `frontend/app/src/lib/api/upstream-pending-scrape.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd frontend/app && grep -rn "from \"@/lib/api/upstream-" src/ | grep -v test
```

Expected: no output (A1-A8 already removed every import).

- [ ] **Step 2: Delete the seven modules**

```bash
cd frontend/app/src/lib/api
rm upstream-scrape.ts upstream-report-scrape.ts upstream-compare-scrape.ts \
   upstream-search-scrape.ts upstream-statistics-scrape.ts \
   upstream-analysis-scrape.ts upstream-pending-scrape.ts
```

- [ ] **Step 3: Search for orphan symbol references**

```bash
cd frontend/app && grep -rn "fetchUpstream\|parseUpstream" src/
```

Expected: no output.

- [ ] **Step 4: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/app/src/lib/api/
git commit -m "refactor(spa): delete 7 upstream HTML scrape modules"
```

---

### Task A10: Phase A verification on 192.168.1.6

**Files:** none modified — verification only.

- [ ] **Step 1: Build + deploy SPA**

```bash
cd frontend/app && npm run build
rsync -av --delete dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
ssh ubuntu@192.168.1.6 'sudo systemctl restart cape-web'
```

- [ ] **Step 2: Run full e2e suite**

```bash
cd frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 npx playwright test --reporter=line
```

Expected: all suites pass. If any fail, the most likely cause is an audit gap that was missed — re-open A0 audit doc and fix the BE field.

- [ ] **Step 3: Manual smoke probe**

In a real browser at `http://192.168.1.6:8000`, sign in as admin and walk:
- `/recent` → tasks render
- `/pending` → renders (or "No pending tasks")
- `/search` (or via topbar search) → results render
- `/submit` → packages/machines dropdowns populated
- `/tasks/<existing id>` → header + Summary tab + Network tab + Behavior tab + Static tab — all render
- `/compare/<id>` → candidates list
- `/stats/7` (statistics 7-day) → cards render
- `/audit` → table renders (Phase 1 audit log)

- [ ] **Step 4: Network-tab inspection**

In DevTools Network tab, confirm: **no requests to `/_upstream/*`**. If any appear, an A-series task was missed — find the source hook and fix it.

- [ ] **Step 5: No commit needed (verification gate)**

This is the gate to enter Phase B. Do not proceed to B unless all above checks pass.

---

## Phase B — BE URL collapse

### Task B1: Delete `_upstream/*` shim routes

**Files:**
- Modify: `web/web/urls.py` (delete 8 lines + their docstring block)

- [ ] **Step 1: Confirm no SPA traffic to `_upstream/*`**

Phase A10 step 4 already verified. If skipped, repeat now.

- [ ] **Step 2: Edit `web/web/urls.py` — delete the 8 `_upstream/*` re_path entries + their leading comment block**

Delete this block (lines 121-156 in the current file):

```python
    # ---- /_upstream/<path> shim — in dev the Vite proxy maps these to
    # `/<path>` on Django; in prod (Django serves the SPA directly) we
    # need explicit Django routes so the SPA's HTML scrape fallback path
    # has somewhere to go. Each entry forwards to the same view the
    # corresponding upstream URL would. ----
    re_path(r"^_upstream/submit/?$", submission_views.index, name="upstream-submit"),
    re_path(r"^_upstream/analysis/?$", analysis_views_module.index, name="upstream-analysis-index"),
    re_path(
        r"^_upstream/analysis/pending/?$",
        analysis_views_module.pending,
        name="upstream-analysis-pending",
    ),
    re_path(
        r"^_upstream/analysis/search/?$",
        analysis_views_module.search,
        name="upstream-analysis-search",
    ),
    re_path(
        r"^_upstream/analysis/(?P<task_id>\d+)/?$",
        analysis_views_module.report,
        name="upstream-analysis-report",
    ),
    re_path(
        r"^_upstream/statistics/(?P<days>\d+)/?$",
        analysis_views.statistics_data,
        name="upstream-statistics",
    ),
    re_path(
        r"^_upstream/compare/(?P<left_id>\d+)/?$",
        compare_views.left,
        name="upstream-compare-left",
    ),
    re_path(
        r"^_upstream/compare/(?P<left_id>\d+)/(?P<right_id>\d+)/?$",
        compare_views.both,
        name="upstream-compare-both",
    ),
```

- [ ] **Step 3: Drop now-orphaned imports**

In `web/web/urls.py`, delete the import line:

```python
from analysis import views as analysis_views_module  # for /_upstream rewrites
```

(`analysis_views` and `submission_views` and `compare_views` are still referenced by binary download routes / other includes — leave them.)

Also drop `submission_views` and `compare_views` imports if they're no longer referenced after step 2. Verify with `grep`:

```bash
grep -nE "submission_views|compare_views" web/web/urls.py
```

If any remain, keep their imports.

- [ ] **Step 4: Run Django check**

```bash
cd web && poetry run python manage.py check
```

Expected: `System check identified no issues`.

- [ ] **Step 5: Curl probe — endpoints should now 404 (or hit SPA catchall)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.6:8000/_upstream/submit/
```

Expected: `404` (or `200` of the SPA shell — both fine; what matters is no Django HTML view hit).

- [ ] **Step 6: Commit**

```bash
git add web/web/urls.py
git commit -m "refactor(urls): drop _upstream/* HTML scrape shims"
```

---

### Task B2: Delete legacy `include(...)` mounts

**Files:**
- Modify: `web/web/urls.py` (delete 4 include lines + their imports)

- [ ] **Step 1: Edit `web/web/urls.py` — delete these `re_path` entries**

```python
    re_path(r"^analysis/", include(analysis)),
    re_path(r"^audit/", include(audit), name="audit"),
    # NB: SPA-owned `/audit` re_path stays — it's at line 62, this is the
    # legacy include at the bottom.
```

(Note: in the current file the `audit` include's `name="audit"` is what the SPA's `re_path(r"^audit(?:/.*)?$", ..., name="spa-audit")` deliberately shadows. Deleting it is fine — SPA's name `spa-audit` survives.)

```python
    re_path(r"^submit/", include(submission)),
    re_path(r"^compare/", include(compare)),
```

- [ ] **Step 2: Drop the `include` imports at the top of the file**

Delete these lines:

```python
from analysis import urls as analysis
from apiv2 import urls as apiv2  # ← KEEP this one
from apiv3 import urls as apiv3  # ← KEEP this one
from audit import urls as audit
from compare import urls as compare
from submission import urls as submission
```

— delete only the four lines for `analysis`, `audit`, `compare`, `submission`.

After this step the import block at the top of `web/web/urls.py` should look like:

```python
from analysis import views as analysis_views   # binary download routes
from apiv2 import urls as apiv2
from apiv3 import urls as apiv3
from web import spa_view
```

(plus pre-existing Django imports above).

- [ ] **Step 3: Verify the SPA-owned `/audit` re_path is still in place**

```bash
grep -n "spa-audit" web/web/urls.py
```

Expected: 1 match showing `re_path(r"^audit(?:/.*)?$", spa_view.spa_index, name="spa-audit")`.

- [ ] **Step 4: Run Django check**

```bash
cd web && poetry run python manage.py check
```

Expected: `System check identified no issues`.

- [ ] **Step 5: Run pytest (this will probably fail tests that exercise legacy URLs)**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append -x 2>&1 | head -60
```

Triage: if a test exercises a deleted URL by name (e.g. `reverse('submission')`), mark it for update in Task B3. Do NOT fix tests in this task — keep the URL change isolated.

- [ ] **Step 6: Commit**

```bash
git add web/web/urls.py
git commit -m "refactor(urls): drop legacy include(analysis|submission|compare|audit)"
```

---

### Task B3: Update / remove tests broken by B2

**Files:**
- Modify or Delete: tests in `tests/` that fail after B2

- [ ] **Step 1: Re-run pytest, capture failures**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append 2>&1 | tee /tmp/b3-failures.log
```

- [ ] **Step 2: Triage each failure**

For each failed test:
- If it exercises a deleted URL via `reverse('submission' | 'compare_left' | 'compare_both' | 'audit_index' | 'analysis_index' | ...)`: the URL no longer exists, so the test is testing dead behavior — **delete the test** with a one-line commit message explaining.
- If it exercises a still-present apiv3 endpoint or admin path: the test hit a real bug — **fix it** (likely a URL that was renamed; replace with apiv3 equivalent).

- [ ] **Step 3: Re-run pytest until green**

```bash
poetry run python -m pytest --import-mode=append
```

Expected: all green.

- [ ] **Step 4: Run ruff**

```bash
poetry run ruff check .
```

Expected: 0 errors. Fix any (likely just unused-import notices).

- [ ] **Step 5: Phase B e2e verification**

Re-deploy + e2e:

```bash
cd frontend/app && npm run build
rsync -av --delete dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
ssh ubuntu@192.168.1.6 'sudo systemctl restart cape-web'
PARITY_SPA_URL=http://192.168.1.6:8000 npx playwright test --reporter=line
```

Expected: all e2e green (same as A10 baseline).

- [ ] **Step 6: Commit**

```bash
git add -A tests/ web/
git commit -m "test: remove or update tests exercising deleted legacy URLs"
```

**GATE:** Do not proceed to Phase C until Phase B verification passes.

---

## Phase C — Templates + static deletion

### Task C1: Audit `{% include %}` and `{% static %}` references in survivors

**Files:**
- Read: `web/templates/admin/`, `web/templates/account/`, `web/templates/socialaccount/`, `web/templates/base.html`, `web/templates/error.html`, `web/templates/robots.txt`, `web/templates/apiv2/index.html`

- [ ] **Step 1: Find every `{% include %}` in survivor templates**

```bash
grep -rEn "\{% include " web/templates/admin web/templates/account \
  web/templates/socialaccount web/templates/base.html web/templates/error.html \
  web/templates/apiv2/index.html 2>/dev/null
```

If any include points to a Phase C target (header.html / footer.html / etc.), STOP — that survivor template depends on a deleted partial. Decision for each:
- (a) Inline the partial's contents into the survivor before deleting the partial.
- (b) Replace the include with an empty string (if partial was decorative).

- [ ] **Step 2: Find every `{% static %}` reference**

```bash
grep -rEn "\{% static |\{% load static" web/templates/admin web/templates/account \
  web/templates/socialaccount web/templates/base.html web/templates/error.html \
  web/templates/apiv2/index.html 2>/dev/null
```

For each `{% static 'X' %}` reference: record the path X. C5 will preserve the corresponding file under `web/static/X`.

- [ ] **Step 3: Find `{% extends %}` chains**

```bash
grep -rEn "\{% extends " web/templates/admin web/templates/account \
  web/templates/socialaccount web/templates/error.html web/templates/apiv2/index.html
```

If any extends `base.html`, that's expected — `base.html` is a survivor. If any extends `header.html` or another deleted target, treat like an `include` per step 1.

- [ ] **Step 4: Write findings into the audit doc**

Append to `docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md` (or create a new audit file `docs/superpowers/audits/2026-05-02-template-static-refs.md`):

```markdown
# Survivor template references — 2026-05-02

## Includes pointing into deletion targets
- (none) | (list)

## Static paths referenced by survivors
- web/static/admin/css/...
- web/static/...
```

This list drives C5.

- [ ] **Step 5: Commit audit**

```bash
git add docs/superpowers/audits/2026-05-02-template-static-refs.md
git commit -m "docs(audit): survivor template include + static refs"
```

---

### Task C2: Delete deletion-target template directories

**Files:**
- Delete dirs:
  - `web/templates/analysis/`
  - `web/templates/submission/`
  - `web/templates/compare/`
  - `web/templates/audit/` (legacy — distinct from the audit_log app at `web/audit_log/`)
  - `web/templates/dashboard/`
  - `web/templates/auth/`

- [ ] **Step 1: Sanity check — confirm survivors have no live `include` into these dirs**

C1 step 1 should have caught this; confirm by re-running:

```bash
grep -rEn "\{% include ['\"](analysis|submission|compare|audit|dashboard|auth)/" \
  web/templates/admin web/templates/account web/templates/socialaccount \
  web/templates/base.html web/templates/error.html web/templates/apiv2/index.html 2>/dev/null
```

Expected: no output.

- [ ] **Step 2: Delete six directories**

```bash
cd web/templates
rm -rf analysis submission compare audit dashboard auth
```

- [ ] **Step 3: Restart web (so any stale Django template cache clears)**

```bash
ssh ubuntu@192.168.1.6 'sudo systemctl restart cape-web'  # only after deploy
# locally:
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append
```

Expected: pytest green.

- [ ] **Step 4: Commit**

```bash
git add -A web/templates/
git commit -m "refactor(templates): delete legacy Bootstrap template dirs"
```

---

### Task C3: Delete standalone HTML templates

**Files:**
- Delete:
  - `web/templates/header.html`
  - `web/templates/footer.html`
  - `web/templates/standalone_error.html`
  - `web/templates/success.html`
  - `web/templates/success_simple.html`
  - `web/templates/success_vtup.html`
  - `web/templates/statistics.html`

- [ ] **Step 1: Confirm no survivor references them**

```bash
grep -rEn "header\.html|footer\.html|standalone_error\.html|success\.html|success_simple\.html|success_vtup\.html|statistics\.html" \
  web/templates/admin web/templates/account web/templates/socialaccount \
  web/templates/base.html web/templates/error.html web/templates/apiv2/index.html 2>/dev/null
```

Expected: no output (or only matches inside our deletion targets — which is fine).

Also check Python view code:

```bash
grep -rEn "render\(.+(['\"])(header|footer|standalone_error|success|success_simple|success_vtup|statistics)\.html\1" web/ 2>/dev/null
```

If hits land in `web/analysis/views.py`, `web/submission/views.py`, `web/compare/views.py` — those are deletion targets (Phase D), and they'd never be reached after Phase B anyway. Safe to delete templates now. If any hit is in `web/analysis/views.py` BUT in a binary-only function we're keeping (file/vtupload/filereport/full_memory*), STOP — that function uses an HTML template we're deleting. Re-investigate.

- [ ] **Step 2: Delete files**

```bash
cd web/templates
rm header.html footer.html standalone_error.html success.html \
   success_simple.html success_vtup.html statistics.html
```

- [ ] **Step 3: Pytest**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append
```

- [ ] **Step 4: Commit**

```bash
git add -A web/templates/
git commit -m "refactor(templates): delete standalone Bootstrap HTML files"
```

---

### Task C4: Delete `frontend/web-design/`

**Files:**
- Delete: `frontend/web-design/cape-design.html` (and the empty parent dir)

- [ ] **Step 1: Confirm orphan**

```bash
grep -rEn "cape-design\.html|frontend/web-design" /Users/lamba/github/cape/ 2>/dev/null | grep -v node_modules
```

Expected: no output.

- [ ] **Step 2: Delete**

```bash
rm -rf /Users/lamba/github/cape/frontend/web-design
```

- [ ] **Step 3: Commit**

```bash
git add -A frontend/
git commit -m "refactor: delete orphan web-design mockup file"
```

---

### Task C5: Delete `web/static/` subdirs per C1 audit

**Files:**
- Delete (subject to C1 audit findings):
  - `web/static/css/`
  - `web/static/js/`
  - `web/static/img/`
  - `web/static/webfonts/`
  - `web/static/graphic/`
  - `web/static/generated/`
  - `web/static/django_extensions/`

- [ ] **Step 1: Read C1 audit list of survivor-referenced static paths**

```bash
cat docs/superpowers/audits/2026-05-02-template-static-refs.md
```

If the list contains any path under `web/static/<dir>/...` for a deletion-target dir, that dir cannot be deleted in full — it must be pruned to keep only the referenced files.

- [ ] **Step 2: For each deletion-target dir, verify it's not referenced**

```bash
for d in css js img webfonts graphic generated django_extensions; do
  echo "--- $d ---"
  grep -rEn "{% static ['\"]$d/" web/templates/ 2>/dev/null | grep -v "templates/admin\|templates/account\|templates/socialaccount\|templates/base.html"
done
```

Expected: no output for any dir, or output only inside already-deleted directories. Anything in the survivor templates means: **do NOT delete that dir** until C1 step 4 fix is applied (e.g. inline the resource into SPA build, or reroute the survivor template to use the SPA's bundled equivalent).

- [ ] **Step 3: Delete confirmed-orphan dirs**

```bash
cd web/static
rm -rf css js img webfonts graphic generated django_extensions
```

(Adjust the list to remove any dir flagged in step 2 as still-referenced.)

- [ ] **Step 4: Confirm `web/static/spa/` is intact**

```bash
ls web/static/spa/index.html
```

Expected: file exists. (This is the Vite build output — must not be deleted.)

- [ ] **Step 5: Pytest + Django check**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append
cd web && poetry run python manage.py check
```

- [ ] **Step 6: Commit**

```bash
git add -A web/static/
git commit -m "refactor(static): delete unreferenced legacy Bootstrap assets"
```

---

### Task C6: Phase C verification on 192.168.1.6

**Files:** none — verification only.

- [ ] **Step 1: Deploy**

```bash
cd /Users/lamba/github/cape
rsync -av --delete frontend/app/dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
rsync -av --delete web/templates/ ubuntu@192.168.1.6:/opt/CAPEv2/web/templates/
rsync -av --delete web/static/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/ \
  --exclude=spa --exclude=admin
ssh ubuntu@192.168.1.6 'sudo systemctl restart cape-web'
```

- [ ] **Step 2: Manual smoke checks (admin / allauth / 403 / robots)**

In a real browser:
- `http://192.168.1.6:8000/admin/login/` — admin login page renders, CSS loads
- `http://192.168.1.6:8000/admin/` (after login) — admin home renders
- `http://192.168.1.6:8000/admin/auth/user/` — user list renders
- `http://192.168.1.6:8000/accounts/login/` — allauth login renders
- `http://192.168.1.6:8000/accounts/password/reset/` — password reset renders
- `http://192.168.1.6:8000/robots.txt` — returns 200 plain-text
- (DevTools → Network) — confirm no 404 on `/static/*` responses

- [ ] **Step 3: 403 page render**

```bash
curl -s -o /tmp/403.html -w "%{http_code}\n" http://192.168.1.6:8000/admin/auth/user/add/ -b "sessionid=<a non-staff session>"
```

Expected: `403`. Then `cat /tmp/403.html` should show the rendered template — not a `TemplateDoesNotExist` traceback.

- [ ] **Step 4: Re-run e2e**

```bash
cd frontend/app && PARITY_SPA_URL=http://192.168.1.6:8000 npx playwright test --reporter=line
```

Expected: all green.

- [ ] **Step 5: No commit (verification gate)**

**GATE:** Do not proceed to Phase D until all above checks pass.

---

## Phase D — Python views surgery

### Task D1: Audit module-level side effects in deletion-target views.py

**Files:**
- Read: `web/analysis/views.py` (top), `web/submission/views.py` (top), `web/compare/views.py` (top), `web/audit/views.py` (top), `web/dashboard/views.py` (top)

- [ ] **Step 1: For each file, list module-level (i.e. NOT inside `def ...`) statements that are not import or constant assignment**

```bash
for f in web/analysis/views.py web/submission/views.py web/compare/views.py \
         web/audit/views.py web/dashboard/views.py; do
  echo "=== $f ==="
  awk '/^[a-zA-Z@_]/ && !/^(import|from|#|"""|'"'"'\.\.\.)/ {print NR": "$0}' "$f" | head -20
done
```

Look for: `signals.connect(...)`, decorator-mounted handlers, model registration, side-effect calls. Anything found: that's a side effect that disappears when the file is deleted. Investigate whether it's needed.

- [ ] **Step 2: Document findings in audit**

Append to `docs/superpowers/audits/2026-05-02-template-static-refs.md` (or create new):

```markdown
## Module-level side effects in deletion targets

- web/analysis/views.py: (e.g.) `signal_processor.connect(report_post_save)` — must be re-wired to web/audit_log/signals.py before deletion. Or: nothing found.
- web/submission/views.py: nothing found
- ...
```

- [ ] **Step 3: Re-wire any required side effects elsewhere**

If step 1 found a real side effect, edit the appropriate place (likely `web/audit_log/signals.py` or `web/web/apps.py`) to re-establish it before D2-D6 delete the file.

- [ ] **Step 4: Commit audit + re-wiring**

```bash
git add docs/superpowers/audits/ web/audit_log/ web/web/
git commit -m "audit(views): catalogue module-level side effects in deletion targets"
```

---

### Task D2: Strip `web/analysis/views.py` to binary-only views

**Files:**
- Modify: `web/analysis/views.py` (delete most functions, keep 6)
- Delete: `web/analysis/urls.py`

- [ ] **Step 1: Identify the 6 functions to keep**

These are referenced from `web/web/urls.py`:
- `file` — `/file/<category>/<task_id>/<dlfile>/`
- `vtupload` — `/vtupload/<category>/<task_id>/<filename>/<dlfile>/`
- `filereport` — `/filereport/<task_id>/<category>/`
- `full_memory_dump_file` — `/full_memory/<n>/`
- `full_memory_dump_strings` — `/full_memory_strings/<n>/`
- `statistics_data` — `/statistics/<days>/`

Plus any helpers they call. Find them:

```bash
grep -nE "^(def |async def )" web/analysis/views.py
```

Capture the list of all function names.

- [ ] **Step 2: Build the keep-set graph**

Starting from the 6 entrypoints, for each one read the function body and add any local helper it calls (`def <name>(...)` defined in the same file). Iterate until closed. The resulting set is the "keep" set; everything else is a "delete" candidate.

Write the list to `docs/superpowers/audits/2026-05-02-template-static-refs.md`.

- [ ] **Step 3: Edit the file**

Open `web/analysis/views.py`. Delete every function NOT in the keep set, plus their decorators and immediate above-line comments.

Trim imports at top — `from django.shortcuts import render` is likely no longer needed (binary-only views use `HttpResponse`/`FileResponse`). Verify with `grep`.

- [ ] **Step 4: Delete `web/analysis/urls.py`**

```bash
rm web/analysis/urls.py
```

- [ ] **Step 5: Run Django check**

```bash
cd web && poetry run python manage.py check
```

Expected: 0 errors. (If `analysis/urls.py` was referenced anywhere we missed, errors now.)

- [ ] **Step 6: Run ruff + isort**

```bash
poetry run ruff check . && poetry run ruff format .
```

Expected: clean.

- [ ] **Step 7: Pytest**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append
```

- [ ] **Step 8: Commit**

```bash
git add -A web/analysis/
git commit -m "refactor(analysis): strip views.py to binary-only download routes"
```

---

### Task D3: Delete `web/submission/`

**Files:**
- Delete: `web/submission/` (entire dir)

- [ ] **Step 1: Confirm no live import**

```bash
grep -rEn "from submission\b|import submission\b" web/ 2>/dev/null | grep -v __pycache__
```

Expected: no output (B2 already removed `from submission import urls/views`).

- [ ] **Step 2: Delete**

```bash
rm -rf web/submission
```

- [ ] **Step 3: Pytest + ruff + Django check**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append \
  && poetry run ruff check . \
  && cd web && poetry run python manage.py check
```

- [ ] **Step 4: Commit**

```bash
git add -A web/
git commit -m "refactor: delete web/submission/ Django app"
```

---

### Task D4: Delete `web/compare/`

**Files:**
- Delete: `web/compare/`

- [ ] **Step 1: Confirm no live import**

```bash
grep -rEn "from compare\b|import compare\b" web/ 2>/dev/null | grep -v __pycache__
```

Expected: no output.

- [ ] **Step 2: Delete**

```bash
rm -rf web/compare
```

- [ ] **Step 3: Pytest + ruff + Django check**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append \
  && poetry run ruff check . \
  && cd web && poetry run python manage.py check
```

- [ ] **Step 4: Commit**

```bash
git add -A web/
git commit -m "refactor: delete web/compare/ Django app"
```

---

### Task D5: Delete `web/audit/` (legacy — distinct from `web/audit_log/`)

**Files:**
- Delete: `web/audit/`

- [ ] **Step 1: Confirm distinction**

```bash
ls web/audit/ && echo "---" && ls web/audit_log/
```

Expected: `web/audit/` has only `__init__.py urls.py views.py` (legacy test-suite stub). `web/audit_log/` has the Phase 1 implementation. They are different apps — only `web/audit/` is being deleted.

- [ ] **Step 2: Confirm no live import of `web.audit` (legacy)**

```bash
grep -rEn "from audit\b|^import audit\b" web/ 2>/dev/null | grep -v __pycache__ | grep -v audit_log
```

Expected: no output.

- [ ] **Step 3: Delete**

```bash
rm -rf web/audit
```

- [ ] **Step 4: Pytest + ruff + Django check**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append \
  && poetry run ruff check . \
  && cd web && poetry run python manage.py check
```

- [ ] **Step 5: Commit**

```bash
git add -A web/
git commit -m "refactor: delete legacy web/audit/ stub (web/audit_log/ unaffected)"
```

---

### Task D6: Delete `web/dashboard/`

**Files:**
- Delete: `web/dashboard/`

- [ ] **Step 1: Confirm no live import**

```bash
grep -rEn "from dashboard\b|import dashboard\b" web/ 2>/dev/null | grep -v __pycache__
```

Expected: no output.

- [ ] **Step 2: Delete**

```bash
rm -rf web/dashboard
```

- [ ] **Step 3: Pytest + ruff + Django check**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append \
  && poetry run ruff check . \
  && cd web && poetry run python manage.py check
```

- [ ] **Step 4: Commit**

```bash
git add -A web/
git commit -m "refactor: delete web/dashboard/ Django app"
```

---

### Task D7: Update `INSTALLED_APPS`

**Files:**
- Modify: `web/web/settings.py`

- [ ] **Step 1: Find the INSTALLED_APPS block**

```bash
grep -nE "INSTALLED_APPS|^    [\"']" web/web/settings.py | head -30
```

- [ ] **Step 2: Edit `web/web/settings.py` — remove these lines from `INSTALLED_APPS`**

```python
    "submission",
    "compare",
    "audit",       # legacy test-suite stub — distinct from "audit_log"
    "dashboard",
```

Keep: `"analysis"`, `"audit_log"`, `"apiv2"`, `"apiv3"`, plus all Django + 3rd-party apps.

- [ ] **Step 3: Run Django check**

```bash
cd web && poetry run python manage.py check
```

Expected: clean.

- [ ] **Step 4: Run pytest**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append
```

- [ ] **Step 5: Commit**

```bash
git add web/web/settings.py
git commit -m "refactor(settings): drop deleted apps from INSTALLED_APPS"
```

---

### Task D8: Remove apiv2 docs landing (view + URL + template)

**Files:**
- Modify: `web/apiv2/views.py` (delete `index` function, lines 166-203)
- Modify: `web/apiv2/urls.py` (delete `re_path(r"^$", views.index, name="apiv2")`)
- Delete: `web/templates/apiv2/index.html` (and parent dir)

- [ ] **Step 1: Edit `web/apiv2/views.py`**

Delete the `index` function (the `@require_safe`-decorated function spanning lines 166-203):

```python
@require_safe
@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def index(request):
    conf = apiconf.get_config()
    parsed = {}
    # … (entire function body)
    return render(request, "apiv2/index.html", {"title": "API", "config": parsed})
```

After deletion, check the imports `apiconf`, `render`, `require_safe`, `conditional_login_required`, `login_required`, `settings` are still used by other functions in the file. Drop unused ones.

- [ ] **Step 2: Edit `web/apiv2/urls.py`**

Delete the line:

```python
re_path(r"^$", views.index, name="apiv2"),
```

- [ ] **Step 3: Delete the template**

```bash
rm -rf web/templates/apiv2
```

- [ ] **Step 4: Verify token API endpoints still work**

```bash
cd web && poetry run python manage.py check
```

Then test on 192.168.1.6 (after deploy in D9):

```bash
# /apiv2/ — docs landing — should now 404 (or hit SPA catchall, returning 200 of SPA shell)
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.6:8000/apiv2/

# Token API — must still work
curl -s -H "Authorization: Token <admin-token>" http://192.168.1.6:8000/apiv2/cuckoo/status/
```

Expected: `apiv2/` = 404 or 200 (SPA shell) — either fine. `cuckoo/status/` = 200 with JSON.

- [ ] **Step 5: Pytest + ruff**

```bash
cd /Users/lamba/github/cape && poetry run python -m pytest --import-mode=append && poetry run ruff check .
```

- [ ] **Step 6: Commit**

```bash
git add web/apiv2/views.py web/apiv2/urls.py web/templates/apiv2
git commit -m "refactor(apiv2): remove docs landing page (token API endpoints unchanged)"
```

---

### Task D9: Phase D verification on 192.168.1.6

**Files:** none — verification only.

- [ ] **Step 1: Deploy**

```bash
cd /Users/lamba/github/cape
rsync -av --delete frontend/app/dist/ ubuntu@192.168.1.6:/opt/CAPEv2/web/static/spa/
rsync -av --delete web/ ubuntu@192.168.1.6:/opt/CAPEv2/web/ --exclude=__pycache__ --exclude=siteauth.sqlite
ssh ubuntu@192.168.1.6 'sudo systemctl restart cape-web cape-rooter cape cape-processor'
```

- [ ] **Step 2: Run Playwright e2e**

```bash
cd frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 npx playwright test --reporter=line
```

Expected: all green.

- [ ] **Step 3: Token API smoke (as user requested — ensure unchanged)**

```bash
TOKEN="<admin DRF token from /admin/authtoken/tokenproxy/>"
curl -s -H "Authorization: Token $TOKEN" \
  http://192.168.1.6:8000/apiv2/cuckoo/status/ | jq .data.version
curl -s -H "Authorization: Token $TOKEN" \
  http://192.168.1.6:8000/apiv2/tasks/list/ | jq .data | head
curl -s -H "Authorization: Token $TOKEN" \
  http://192.168.1.6:8000/apiv2/files/view/sha256/<known-sha256>/ | jq
curl -s -H "Authorization: Token $TOKEN" \
  http://192.168.1.6:8000/apiv2/machines/list/ | jq
```

Expected: all 200 with valid JSON. None should 404 or 500.

- [ ] **Step 4: Manual smoke — full SPA walk**

Browser tour same as A10 step 3 — every page renders identically to baseline.

- [ ] **Step 5: Manual smoke — admin / allauth / 403 / robots**

Same as C6 step 2-3.

- [ ] **Step 6: File-count diff vs Pre-flight Step 4**

```bash
cd /Users/lamba/github/cape
echo "templates:";   find web/templates -type f | wc -l
echo "static-css:";  find web/static/css -type f 2>/dev/null | wc -l
echo "static-js:";   find web/static/js -type f 2>/dev/null | wc -l
echo "scrape-mods:"; ls frontend/app/src/lib/api/upstream-*.ts 2>/dev/null | wc -l
```

Expected:
- templates: from ~120 down to ~30
- static-css: 0 (deleted) or low single digits
- static-js: 0
- scrape-mods: 0

- [ ] **Step 7: mypy (agent scope, per pyproject)**

```bash
poetry run mypy
```

Expected: clean.

- [ ] **Step 8: No commit (verification gate)**

---

## Final

### Task F1: Push to origin + announce

**Files:** none — operational only.

- [ ] **Step 1: Confirm clean tree + 4 phase commit chain visible**

```bash
git log --oneline refactor/web-spa..HEAD | head -40
git status
```

- [ ] **Step 2: Push**

```bash
git push origin refactor/web-spa
```

- [ ] **Step 3: Update deployment notes**

Append to `docs/web/deploy-192.168.1.6.md`:

```markdown
## 2026-05-02 — FE/BE separation cleanup deployed

- Phase A: SPA scrape fallback removed; apiv3 now authoritative
- Phase B: `_upstream/*` shims and legacy `include(...)` deleted
- Phase C: 200+ Bootstrap templates + ~5 MB static assets deleted
- Phase D: 5 Django apps deleted; web/analysis/views.py stripped to binary-only

Token API on /apiv2/* unchanged. SPA at /<any-route> goes through spa_view catchall.
```

```bash
git add docs/web/deploy-192.168.1.6.md
git commit -m "docs: 2026-05-02 deployment record — FE/BE cleanup"
git push origin refactor/web-spa
```

---

## Self-Review Checklist (controller)

When all 4 phases complete, controller (or a final reviewer subagent) should re-check:

1. **Spec coverage** — every spec section §5/§6/§7/§8 has corresponding tasks. ✅
2. **Phase order honored** — A precedes B precedes C precedes D, and each gate (A10/B3/C6/D9) was passed before next phase started. ✅
3. **No new endpoints created** — apiv3 modifications (in A0-A8 if needed) only fill gaps, don't introduce new business logic. ✅
4. **No silent behavior change** — `apiv2/*` token API surface untouched (verify D9 step 3). ✅
5. **Audit docs preserved** — `docs/superpowers/audits/2026-05-02-*.md` retained for archaeology. ✅
6. **All 4 phase commits revertable independently** — `git revert <commit>` for any single phase commit cleanly undoes that phase. ✅
