# apiv3 Shape Diff Audit — 2026-05-02

Per-hook comparison of `try { apiv3 }` vs `catch { adapt(scrape()) }` return shapes.
GAP column key: "" = no gap, "BE" = fix in apiv3, "TYPE" = type/format mismatch, "FE" = drop SPA-side field.

Sources cross-checked per section:
- SPA hook (`frontend/app/src/hooks/<hookFile>.ts`)
- TS interface (`frontend/app/src/lib/api/<module>.ts`)
- Scrape adapter (`frontend/app/src/lib/api/upstream-*-scrape.ts`)
- apiv3 view (`web/apiv3/views.py`) + serializer (`web/apiv3/serializers.py`) + service (`web/services/<svc>.py`)

Note on baseline: the scrape is intentionally lossy in many places (cf. `asBehaviorReport` returning `{platform: null, processtree: [], processes: []}`). When scrape is degenerate, it is NOT a useful baseline — flagged "no (degenerate)" with no resulting gap.

---

## 1. useReportSummary (`/api/v3/reports/<id>/summary/`)

TS interface `ReportSummary` (`frontend/app/src/lib/api/reports.ts:11-37`).
apiv3 path: `web/apiv3/views.py:691 report_summary` → `report_service.fetch_summary` (`web/services/report_service.py:125-209`) → `ReportSummarySerializer` (`web/apiv3/serializers.py:343`).
Scrape: `asReportSummary(UpstreamReportScrape)` (`upstream-report-scrape.ts:282-299`) over `/_upstream/analysis/<id>/`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `task` | yes (full TaskSummary from `task_service.view_task`) | yes (synthesized from card scrape; many fields zeroed/null) | TYPE | apiv3 canonical — scrape's TaskSummary has score=0/severity="clean"/verdict="clean" placeholders. No action — apiv3 already richer. |
| `available_sections` | yes (`_SECTION_DETECTORS`) | yes (parsed from tab strip) | | no action — both populate the same union of tab keys |
| `tab_counts` | yes (numeric or humanized strings) | yes (mostly `"—"` placeholders for non-summary tabs) | TYPE | no action — apiv3 numeric is canonical, scrape's `"—"` was a placeholder |
| `signatures` | yes (full `SignatureLite[]` with name/description/severity/ttp) | yes (best-effort; description always `""`, severity always `3`, ttp always `[]`) | | no action — scrape lossy by design, apiv3 has full data |
| `score` | yes (float or null) | no (always `null`) | | no action — apiv3 only |
| `severity` | yes | no (hard-coded `"clean"`) | | no action — apiv3 only |
| `verdict` | yes | no (hard-coded `"clean"`) | | no action — apiv3 only |
| `family` | yes (from `detections.family`) | no (always `null`) | | no action — apiv3 only |
| `behavior_summary` | yes (`_trim_behavior_summary(behavior.summary)`) | no (omitted by `asReportSummary`) | | no action — apiv3 only |
| `analysis_info` | yes | yes | | no action |
| `machine_info` | yes | yes | | no action |
| `file_info` | yes | yes | | no action |
| `pe_info` | yes (full PeInfo: versioninfo/sections/imports/exports/resources/overlay/misc/digital_signers/peid_signatures) | yes (versioninfo/sections/imports/exports/resources/misc; overlay/digital_signers/peid_signatures absent) | | no action — apiv3 superset |
| `statistics_processing` | yes (processing/signatures/reporting buckets) | yes (same shape) | | no action |
| `subfiles` | yes (from `target.file.selfextract`) | yes (best-effort from "Subfile Information" card; `path` always `""`, `method` always `""`) | | no action — apiv3 canonical |
| `yara_matches` | yes (combined yara/cape_yara/clamav) | no (omitted by `asReportSummary`) | | no action — apiv3 only |
| `virustotal` | yes (positives/total/permalink/scan_date/names) | no (omitted by `asReportSummary`) | | no action — apiv3 only |

Verdict: **No BE gap.** apiv3 strictly dominates the scrape baseline.

---

## 2. useReportTabs (composite)

`useReportTabs.ts` is a barrel of seven sibling hooks that each call one apiv3 endpoint and fall back to one section adapter on the same `UpstreamReportScrape`. Audited per sub-hook below.

### 2a. useReportStatic — `/api/v3/reports/<id>/static/` vs `asStaticReport`

TS `StaticReport` (`reports.ts:201-204`): `{static: Record<string, unknown>, target_file: Record<string, unknown>}`.
apiv3: `report_service.fetch_static` (`report_service.py:524-538`) returns `{static: doc.static, target_file: target.file}`.
Scrape (`upstream-report-scrape.ts:301-306`): `{static: {}, target_file: <file_info kv>}`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `static` | yes (Mongo `static` doc — full PE/CAPA/curtain) | no (always `{}`) | | no action — apiv3 only |
| `target_file` | yes (full Mongo `target.file`) | yes (just the file_info kv card) | | no action — apiv3 superset |

### 2b. useReportAttack — `/api/v3/reports/<id>/attack/` vs `asAttackReport`

TS `AttackReport` (`reports.ts:211-214`): `{ttps: unknown[], mitre_attck: unknown[]}`.
apiv3: `fetch_attack` returns `{ttps, mitre_attck}` from Mongo.
Scrape: `{ttps: [], mitre_attck: []}` (always empty — TTPs are lazy-loaded upstream behind CSRF).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `ttps` | yes | no (degenerate) | | no action — scrape can't reach load_files |
| `mitre_attck` | yes | no (degenerate) | | no action — scrape can't reach load_files |

### 2c. useReportConfig — `/api/v3/reports/<id>/config/` vs `asConfigReport`

TS `ConfigReport` (`reports.ts:221-223`): `{malware_conf: unknown[]}`.
apiv3: `fetch_config` returns `{malware_conf: doc.malware_conf}`.
Scrape: `{malware_conf: []}` (degenerate).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `malware_conf` | yes | no (degenerate) | | no action |

### 2d. useReportNetwork — `/api/v3/reports/<id>/network/` vs `asNetworkReport`

TS `NetworkReport` (`reports.ts:230-245`): hosts/domains/tcp/udp/icmp/smtp/irc/http + suricata{alerts,tls,http,files}.
apiv3: `fetch_network` (`report_service.py:579-618`) — picks first non-empty from `http_ex/https_ex/http`; passes through hosts/domains/tcp/udp/icmp/smtp/irc; suricata{alerts,tls,http,files}.
Scrape (`parseNetworkSection`): hosts/domains/tcp/udp/icmp/smtp/irc/http + suricata{alerts,tls,http} — `suricata.files` is **never populated** by the scrape parser (`pullRowsByTitle` only called for alerts/tls/http).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `hosts` | yes | yes (parsed rows) | | no action |
| `domains` | yes | yes | | no action |
| `tcp` | yes | yes | | no action |
| `udp` | yes | yes | | no action |
| `icmp` | yes | yes | | no action |
| `smtp` | yes | yes | | no action |
| `irc` | yes | yes | | no action |
| `http` | yes (http_ex/https_ex/http first non-empty) | yes (HTTP Requests rows) | | no action |
| `suricata.alerts` | yes | yes | | no action |
| `suricata.tls` | yes | yes | | no action |
| `suricata.http` | yes | yes | | no action |
| `suricata.files` | yes | no (degenerate — scrape never pulls it) | | no action |

### 2e. useReportDropped — `/api/v3/reports/<id>/dropped/` vs `asDroppedReport`

TS `DroppedReport`: `{dropped: unknown[]}`.
apiv3: `fetch_dropped` returns `{dropped: doc.dropped}`.
Scrape: `{dropped: []}` (degenerate — lazy-loaded upstream).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `dropped` | yes | no (degenerate) | | no action |

### 2f. useReportPayloads — `/api/v3/reports/<id>/payloads/` vs `asPayloadsReport`

TS `PayloadsReport`: `{payloads: unknown[]}`.
apiv3: `fetch_payloads` returns `{payloads: doc.CAPE.payloads}`.
Scrape: `{payloads: []}` (degenerate).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `payloads` | yes | no (degenerate) | | no action |

### 2g. useReportScreenshots — `/api/v3/reports/<id>/screenshots/` vs `asScreenshotsReport`

TS `ScreenshotsReport` (`reports.ts:276-279`): `{count: number, shots: ScreenshotEntry[]}`.
apiv3: `fetch_screenshots` returns `{count, shots: [{index, url, thumbnail_url}]}`.
Scrape: `{count: 0, shots: []}` (degenerate).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `count` | yes | no (degenerate, always 0) | | no action |
| `shots` | yes | no (degenerate) | | no action |

Verdict for hook 2: **No BE gap across all 7 sub-hooks.** Scrape adapters are largely degenerate stubs because upstream lazy-loads these tabs over CSRF-protected POSTs.

---

## 3. useBehavior (`/api/v3/reports/<id>/behavior/`)

TS `BehaviorSummary` (`reports.ts:114-121`): `{platform, processtree, processes, detections2pid?}`.
apiv3: `report_service.fetch_behavior` (`report_service.py:674-749`) → `BehaviorSummaryResponseSerializer`.
Scrape: `asBehaviorReport()` returns `{platform: null, processtree: [], processes: []}` — fully degenerate.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `platform` | yes (`info.machine.platform`) | no (degenerate, always `null`) | | no action — scrape can't reach `/analysis/load_files/<id>/behavior/` (needs CSRF) |
| `processtree` | yes | no (degenerate, always `[]`) | | no action |
| `processes[].pid` | yes | no (degenerate) | | no action |
| `processes[].ppid` | yes | no (degenerate) | | no action |
| `processes[].name` | yes | no (degenerate) | | no action |
| `processes[].calls_count` | yes (approximate `len(chunks)*100`) | no (degenerate) | | no action |
| `processes[].chunk_count` | yes | no (degenerate) | | no action |
| `processes[].module_path` | yes | no (degenerate) | | no action |
| `processes[].image_base` | yes | no (degenerate) | | no action |
| `processes[].size` | yes | no (degenerate) | | no action |
| `processes[].bitness` | yes | no (degenerate) | | no action |
| `processes[].first_seen` | yes | no (degenerate) | | no action |
| `processes[].environ` | yes (CommandLine/MainExeBase/MainExeSize/Bitness/DllBase) | no (degenerate) | | no action |
| `detections2pid` | yes | no (degenerate, omitted) | | no action |

Verdict: **No BE gap.** Scrape is fully degenerate; apiv3 is the only real source.

(Companion `useReportBehaviorCalls` and `useReportBehaviorSearch` are not part of the listed 8 hooks but for completeness their scrape fallbacks return empty `{calls:[], page, total_chunks:0, has_next:false}` and `useReportBehaviorSearch` has no scrape fallback at all — apiv3 only.)

---

## 4. useCompareCandidates (`/api/v3/compare/<l>/`)

TS `CompareCandidatesResponse` (`compare.ts:4-9`): `{ok, left, records, md5}`.
apiv3: `compare_service.candidates` (`compare_service.py:24-97`) → `CompareCandidatesResponseSerializer`.
Scrape: `parseUpstreamCompareCandidatesHtml`. Adapter at `useCompare.ts:23-30` projects scrape into `{ok, left, records, md5}` (drops the scrape's extra `empty_message`).

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `ok` | yes (true on success, false on lookup failure) | yes (always `true` in scrape) | | no action |
| `left` | yes (full TaskSummary from Postgres `task_service.view_task`) | yes (TaskSummary synthesized from HTML row — most fields placeholder/zeroed) | TYPE | apiv3 canonical; scrape's TaskSummary fills only id/target/md5/machine/completed/duration. No action — apiv3 strictly richer. |
| `records` | yes (full TaskSummary[] from Postgres) | yes (synthesized TaskSummary[]; lossy as above) | TYPE | apiv3 canonical |
| `md5` | yes (left task's `md5` from Postgres) | yes (left.md5 if present, else null) | | no action |
| `empty_message` (scrape-only) | n/a (apiv3 returns `records: []` with `ok: true`) | yes (scrape-only field, dropped in adapter projection) | FE | already dropped at `useCompare.ts` adapter projection — no action needed |
| `error_code` / `error_value` (apiv3-only) | yes (when ok=false) | no | | no action — error envelope is apiv3-only and not in TS interface; SPA inspects `ok` |

Verdict: **No BE gap.** apiv3 returns full TaskSummary objects from Postgres; scrape baseline is HTML-shaped with placeholders.

---

## 5. useCompareDiff (`/api/v3/compare/<l>/<r>/`)

TS `CompareDiffResponse` (`compare.ts:11-18`): `{ok, left, right, left_counts, right_counts, summary}`.
apiv3: `compare_service.diff` (`compare_service.py:100-150`) → `CompareDiffResponseSerializer`. Uses `helper_percentages_mongo` + `helper_summary_mongo` from `lib.cuckoo.common.compare`.
Scrape: `parseUpstreamCompareDiffHtml`. Adapter at `useCompare.ts:48-57`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `ok` | yes | yes (always `true`) | | no action |
| `left` | yes (full TaskSummary from Postgres) | yes (synthesized; lossy) | TYPE | apiv3 canonical |
| `right` | yes (full TaskSummary from Postgres) | yes (synthesized; lossy) | TYPE | apiv3 canonical |
| `left_counts` | yes (`Record<str, number>` from `helper_percentages_mongo`) | no (always `{}` — comment in scrape parser explicitly notes "best-effort: pick up any data-counts-{id} attributes") | | no action — apiv3 only |
| `right_counts` | yes | no (always `{}`) | | no action — apiv3 only |
| `summary` | yes (`Record<str, str[]>` — overlapping behavior summary keys with values) | yes-but-lossy (parses `<li>{cat}: {n} matches</li>` into `{cat: []}` — keys only, **no values**) | | no action — apiv3 returns full string lists; scrape returns empty arrays (it's the keys that matter visually but apiv3 already has the values too) |

Verdict: **No BE gap.** apiv3's `helper_percentages_mongo` and `helper_summary_mongo` produce strictly richer output than the HTML scrape can parse.

---

## 6. useSearch (`/api/v3/search/`)

TS `SearchResponse` (`search.ts:10-16`): `{ok, term, raw, error, items}`.
apiv3: `search_service.run_search` (`web/apiv3/views.py:232-246`) → `SearchResponseSerializer`. Returns extra `value` field (Spectacular envelope, not in TS interface — apiv3 superset).
Scrape: `fetchUpstreamSearchScrape` → `parseUpstreamSearchHtml`. Adapter projection at `useSearch.ts:27-33`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `ok` | yes | yes | | no action |
| `term` | yes (echoed) | yes (parsed from `<h3>` echo) | | no action |
| `raw` | yes (echoed) | yes (raw query) | | no action |
| `error` | yes | yes (`.alert.alert-danger` text or null) | | no action |
| `items` | yes (full TaskSummary[]) | yes (synthesized TaskSummary[]; sha256/sha1 always `""`, score=0, severity/verdict=`"clean"`, network_count=0, etc.) | TYPE | apiv3 canonical; scrape lossy by design |
| `value` (apiv3-only) | yes (parsed/typed query value) | no | | no action — not in TS interface (`SearchResponse`); apiv3 returns it but SPA doesn't consume. Optional FE follow-up: add `value?: unknown` to TS if needed downstream. |

Verdict: **No BE gap.** apiv3 returns the full set; scrape's TaskSummary placeholders are by design.

---

## 7. useStatistics (`/api/v3/statistics/<days>/`)

TS `StatisticsResponse` (`statistics.ts:17-31`).
apiv3: `statistics_service.get_statistics` (`statistics_service.py:18`) → `StatisticsResponseSerializer`.
Scrape: `fetchUpstreamStatisticsScrape` → `parseUpstreamStatisticsHtml`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `days` | yes | yes (overridden if "Statistics Overview" card present) | | no action |
| `total` | yes | yes | | no action |
| `average` | yes | yes | | no action |
| `tasks_per_day` | yes (`{day, added, reported, failed}[]`) | yes | | no action |
| `processing` | yes (`{name, total, runs, avg}[]`) | yes | | no action |
| `signatures` | yes | yes | | no action |
| `reporting` | yes | yes | | no action |
| `custom_statistics` | yes | yes (parses "Custom Stats" card) | | no action |
| `top_samples` | yes | no (always `[]` — scrape parser doesn't have a "Top Samples" card extractor) | | no action — apiv3 only |
| `detections` | yes | yes | | no action |
| `asns` | yes | yes | | no action |
| `distributed_tasks` | yes | no (always `[]` — scrape parser doesn't extract) | | no action — apiv3 only |
| `error` | yes | yes (always `null` from scrape) | | no action |

Verdict: **No BE gap.** apiv3 returns the full set; scrape is missing `top_samples` and `distributed_tasks` (these get rendered as cards lower on the upstream page that the parser doesn't crack open, but apiv3 already provides them).

---

## 8. useSubmissionForm (`/api/v3/system/submission-form/`)

TS `SubmissionFormData` (`submission-form.ts:41-49`).
apiv3: `submission_service.submission_form_data` (`web/services/submission_service.py:55-217`) → `SubmissionFormDataSerializer`.
Scrape: `fetchUpstreamSubmitScrape` → `parseUpstreamSubmitHtml`. Adapter `adaptScrapeToFormData` at `useSubmissionForm.ts:32-70`.

| Field | apiv3 returns? | scrape adapter returns? | GAP | Decision |
|---|---|---|---|---|
| `packages[].name` | yes | yes | | no action |
| `packages[].value` | yes | yes | | no action |
| `packages[].summary` | yes | yes (split from option text after `" - "`) | | no action |
| `packages[].description` | yes | yes (from `option[title]`) | | no action |
| `packages[].platform` | yes (from `analyzer/<platform>/modules/packages/`) | no (hard-coded `"windows"` in adapter) | | no action — apiv3 canonical |
| `machines[]` | yes (`{value, label}` real VMs only; "First available" placeholder filtered) | yes (`{value, label}` from `<select>`; includes the placeholder option) | TYPE | no action — apiv3 canonical; SPA renders its own "Auto" |
| `machine_tags[]` | yes (from `load_vms_tags()`, sorted) | yes (parsed from `#tagshelp <code>` elements) | | no action |
| `route_options[].name` | yes | yes (mapped from `r.value`) | | no action |
| `route_options[].label` | yes | yes (from option `<option>` text) | | no action |
| `route_options[].type` | yes (internet/inetsim/tor/vpn/socks5/exitnode/none) | yes (`"none"` if value is "none", else `"vpn"`) | TYPE | no action — apiv3 has the real type taxonomy; scrape collapses to vpn/none which is good-enough fallback |
| `route_options[].description` | yes (vpns + socks5 carry `description`) | no (omitted by adapter) | | no action — apiv3 only |
| `random_route` | yes (preview object when `random_socks5`/`random_vpn` configured) | no (hard-coded `null` in adapter) | | no action — feature requires routing.conf access scrape can't see |
| `default_route` | yes (`routing.routing.route` config) | no (hard-coded `"none"` in adapter) | | no action — apiv3 only |
| `config.kernel` | yes | yes (`toggles.has("kernel_analysis")`) | | no action |
| `config.memory` | yes (`processing.memory.enabled`) | yes (`toggles.has("memory")`) | | no action — different signals but same boolean |
| `config.procmemory` | yes | yes | | no action |
| `config.dlnexec` | yes (`settings.DLNEXEC`) | yes (`tabs.dlnexec` — nav pill present) | | no action |
| `config.url_analysis` | yes (`settings.URL_ANALYSIS`) | yes (`tabs.url`) | | no action |
| `config.tags` | yes (`bool(machine_tags)`) | yes (`s.machine_tags.length > 0`) | | no action |
| `config.dist_master_storage_only` | yes | no (hard-coded `false` in adapter) | | no action — apiv3 only |
| `config.linux_on_gui` | yes | yes (presence of `input[name='lin_options']`) | | no action |
| `config.tlp` | yes (`web_conf.tlp.enabled`) | yes (presence of `select[name='tlp']`) | | no action |
| `config.timeout` | yes (int from `cfg.timeouts.default`) | yes (parsed from `<input name='timeout' value=...>`) | | no action |
| `config.amsidump` | yes | yes | | no action |
| `config.pre_script` | yes | yes | | no action |
| `config.during_script` | yes | yes | | no action |
| `config.downloading_service` | yes | yes (`tabs.downloading_service`) | | no action |
| `config.interactive_desktop` | yes | yes (`toggles.has("interactive")`) | | no action |

Verdict: **No BE gap.** Where the scrape adapter hard-codes a placeholder (`platform: "windows"`, `random_route: null`, `default_route: "none"`, `dist_master_storage_only: false`), apiv3 already has the real value.

---

## Summary of BE fixes required

**No BE fixes required.** All 8 hooks can drop the scrape fallback in their respective tasks (A1-A8) without apiv3 changes.

Across all 8 hooks, every place where the SPA's `try { fetchApiv3() } catch { adapt(scrape()) }` had a real possibility of the scrape providing more data than apiv3, apiv3 turned out to either match or strictly dominate the scrape baseline. In particular:

- **Lazy-loaded report tabs** (behavior, dropped, payloads, screenshots, attack, config) are CSRF-gated upstream, so the scrape adapter returns degenerate empty stubs by design (see `asBehaviorReport`, `asDroppedReport`, etc. in `upstream-report-scrape.ts`). apiv3 reads them from Mongo directly.
- **TaskSummary fields synthesized from HTML rows** (in compare/search scrapes) are zeroed/placeholder values; apiv3 reads from Postgres `task_service.view_task` and returns the real summary.
- **Submission form** scrape lacks platform-aware packages, route descriptions, random_route preview, default_route and `dist_master_storage_only` — all of which apiv3 already returns from `Config(...)` reads.
- **Statistics** scrape skips `top_samples` and `distributed_tasks`; apiv3 has both.

### Type-only differences (informational, no BE action needed)

- `useReportSummary.task`, `useCompareCandidates.{left,records}`, `useCompareDiff.{left,right}`, `useSearch.items`, `useSubmissionForm.machines`/`route_options[].type` — scrape returns shape-compatible TaskSummary/etc. but with placeholder values; apiv3 returns canonical.

### FE-only follow-ups (out of scope here)

- `SearchResponse` does not declare `value` even though apiv3 returns it. Optional: add `value?: unknown` to `frontend/app/src/lib/api/search.ts:SearchResponse` if downstream code starts using it. Not blocking the fallback removal.
- `CompareCandidatesResponse` does not declare `error_code`/`error_value`/`empty_message`. The `useCompare.ts` adapter already drops them. Not blocking.

### Uncertainties flagged with `?` 

None of the per-field rows above are flagged `?` — every field had a concrete adapter mapping or `_build_*` service path to inspect. If anything was hidden behind a runtime `Config(...)` lookup that this static audit can't validate against a live deploy, the relevant cell still records the apiv3 superset as authoritative because the scrape side is provably hard-coded (see e.g. `random_route: null`, `default_route: "none"` in the scrape adapter source).

Items that would benefit from runtime confirmation against a sample dataset (not blocking):
- `report_summary.subfiles[].method` — apiv3 builds it from `target.file.selfextract` dict keys; scrape always returns `""`. Worth confirming on a real archive sample that apiv3 emits the same method name the SPA UI expects.
- `compare_diff.summary` values — apiv3 returns `Record<str, str[]>` (key + per-key string list from `helper_summary_mongo`); scrape returns `{key: []}` (keys only). Worth eyeballing the SPA's compare-page renderer to confirm it consumes the values, not just the keys.
- `useReportBehaviorCalls` (not in the 8 audited hooks but referenced by useBehavior page) — scrape fallback is `{calls: [], page, total_chunks: 0, has_next: false}`, fully degenerate. apiv3 is the only real source. No action.
