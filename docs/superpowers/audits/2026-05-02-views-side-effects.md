# views.py Module-Level Side-Effects Audit — 2026-05-02

Branch: `refactor/web-spa`
Scope: read-only audit feeding Phase D (D2-D6) of
`docs/superpowers/plans/2026-05-02-fe-be-separation-cleanup.md`.

This audit catalogues every module-level statement that has an effect at
import time in the five legacy Django views modules slated for deletion
or partial removal under Phase D. For each statement we decide whether
deleting it loses functionality needed elsewhere and, if so, prescribe a
re-wiring fix.

`web/analysis/views.py` is the special case: its file is being shrunk
(not deleted), keeping six binary download / statistics endpoints still
referenced from `web/web/urls.py`. Section 1.4 builds the transitive
keep-set for those six entries.

The other four files (`submission`, `compare`, `audit`, `dashboard`) are
slated for whole-file deletion under D3-D6. The remaining sections look
for any external code that would break.

---

## Summary

- **2** risks requiring re-wiring before D2-D6 deletion (both in submission)
- **0** risks blocking the keep-set rewrite of `web/analysis/views.py`
- **0** template-tag risks (no surviving template loads any non-builtin tag library)
- **0** signal / ready-hook risks (no app does module-level signal connect)

Recommended pre-deletion fix list:

1. Before D3 deletes `web/submission/`, port `submission.views.get_form_data`
   (and its four helpers + `db = Database()` + `web_conf = Config("web")`)
   into `web/services/submission_service.py` so the lazy import at
   `web/services/submission_service.py:77` no longer reaches into the
   deleted module. apiv3's `submission_form_data` endpoint depends on
   this chain.
2. Before D3 deletes `web/submission/`, scrub `web/analysis/forms.py:6`
   (`from submission.models import Comment, Tag`). The line is
   pre-existing dead code (`web/submission/` has never had a
   `models.py`), but removing the source app makes the broken import
   an active hazard if anything ever imports `analysis.forms`.

Section 6 spells out the concrete edits.

---

## 1. web/analysis/views.py

3236 lines. Six entry points kept (per `web/web/urls.py:52-62`); rest deleted.

### 1.1 Module-level imports / sys.path / try-except ImportError

| Line | Statement | Side effect | Lost on delete? | Action |
|---|---|---|---|---|
| 5-19 | stdlib imports (`base64`, `os`, `subprocess`, `tempfile`, `zipfile`, `BytesIO`, `Path`, `FileWrapper`, ...) | none beyond name binding | KEPT — used by entry points | keep all that the keep-set needs (see § 1.4) |
| 21-28 | Django + DRF imports (`settings`, `login_required`, `HttpResponse`, `StreamingHttpResponse`, `csrf_exempt`, `require_safe`, `api_view`, ...) | none | KEPT | keep |
| 30-36 | `MONGO_DOCUMENT_TOO_LARGE_ERRORS = ()` then `try: from pymongo.errors import DocumentTooLarge` | binds module-level constant; pulls in pymongo if available | LOST safely — only `report` / `signature_calls` reference it; not in keep-set | delete with surrounding code |
| 38 | `sys.path.append(settings.CUCKOO_PATH)` | mutates global `sys.path` | REDUNDANT — `web/manage.py` and the WSGI entry already insert `CUCKOO_PATH`, and every other Django app under `web/` does the same append at import time (`compare/views.py:12`, `submission/views.py:20`, `audit/views.py:19`, `dashboard/views.py:14`, `apiv3/views.py`). Since `analysis/views.py` is loaded last via `from analysis import views as analysis_views` in `web/web/urls.py:5`, by then `sys.path` already contains the entry. Safe to drop, but cheaper to keep — one idempotent `append`. | KEEP (no harm; deletion is optional cosmetic) |
| 40-49 | `lib.cuckoo.*` imports (`PcapToNg`, `Config`, `CUCKOO_ROOT`, `path_exists`, `path_safe`, `delete_folder`, `yara_detected`, `category_all_files`, `my_rate_minutes`, `my_rate_seconds`, `perform_search`, `rateblock`, `statistics`, `Database`, `TasksMixIn`, `TASK_PENDING`, `Task`, `CHUNK_CALL_SIZE`, `network`) | name binding | MIXED — keep what § 1.4 needs (`PcapToNg`, `Config`, `CUCKOO_ROOT`, `ANALYSIS_BASE_PATH`, `path_exists`, `path_safe`, `yara_detected` is unused, `category_all_files`, `my_rate_*`, `perform_search`, `rateblock`, `statistics`); drop the rest (`network`, `delete_folder`, `Database`, `TasksMixIn`, `TASK_PENDING`, `Task`, `CHUNK_CALL_SIZE`) | trim to keep-set imports |
| 51-57 | `try: from django_ratelimit.decorators import ratelimit` (with double-fallback to legacy `ratelimit`) | binds `ratelimit` decorator | KEPT — `file()`, `vtupload()` (decorated lines 2304-2305, 2666-2667) and `on_demand()` use it; entry-point `file()` keeps it | keep |
| 59 | `from audit_log import helpers as audit` | name binding | LOST safely — not referenced in keep-set (only `report`, `comments`, etc. use `audit.*`) | delete |
| 60 | `from lib.cuckoo.common.webadmin_utils import disable_user` | binds `disable_user` | LOST safely — only `ban_user` / `ban_all_user_tasks` use it | delete |
| 62-65 | `try: import re2 as re` else `import re` | binds `re` (regex engine) | LOST safely — only `search()` uses `re.match()` for hash detection; not in keep-set | delete |
| 67-72 | `try: import requests; HAVE_REQUEST = True` | sets `HAVE_REQUEST`, binds `requests` | KEPT — `vtupload()` (line 2947) calls `requests.post(...)`. Note: `vtupload` does NOT guard with `HAVE_REQUEST`, so the import is required, not optional. | keep `import requests`; `HAVE_REQUEST` itself is never tested → drop the boolean |
| 74-80 | `try: import pyzipper; HAVE_PYZIPPER = True` | sets `HAVE_PYZIPPER`, binds `pyzipper` | KEPT — `file()` uses both (lines 2317, 2486) | keep |
| 82 | `TASK_LIMIT = 25` | binds constant | LOST safely — only `pending()` uses it | delete |
| 84-87 | `processing_cfg = Config("processing")`, `reporting_cfg = Config("reporting")`, `integrations_cfg = Config("integrations")`, `web_cfg = Config("web")` | reads four config files at import time | MIXED — `integrations_cfg` (used by `vtupload`) and `web_cfg` (used by `_path_safe`, `file`) are KEPT; `processing_cfg` and `reporting_cfg` only feed the `HAVE_*` on-demand toggles below (deleted) and the `on_demand_config_mapper` (deleted) | drop `processing_cfg` and `reporting_cfg`; keep `integrations_cfg` and `web_cfg` |
| 89-122 | Six `if cfg.<x>.on_demand: from ... import ...; HAVE_X = True` blocks (FLARE-CAPA, strings, EVTX, vba2graph, XLM-deobf, virustotal) | conditionally imports modules + sets `HAVE_*` flags | LOST safely — none of `HAVE_FLARE_CAPA`, `HAVE_STRINGS`, `HAVE_EVTX`, `HAVE_VBA2GRAPH`, `HAVE_XLM_DEOBF`, `HAVE_VIRUSTOTAL` is referenced inside the keep-set. They are read by `report`, `on_demand`, `load_files` etc. (deleted). | delete entire block |
| 124-134 | `if reporting_cfg.bingraph.on_demand: try: ... HAVE_BINGRAPH = True else: False` | conditional import | LOST safely | delete |
| 136-138 | `HAVE_FLOSS` toggle | conditional import | LOST safely | delete |
| 140-143 | `USE_SEVENZIP = False / True; SEVENZIP_PATH = ...` | binds constants | KEPT — `file()` reads `USE_SEVENZIP` (line 2471) and `SEVENZIP_PATH` (line 2473). | keep |
| 145-158 | `enabledconf = {}; on_demand_conf = {}`; outer for-loop reads six conf files (`integrations`, `reporting`, `processing`, `auxiliary`, `web`, `distributed`) building `enabledconf` and `on_demand_conf` | populates two module-level dicts at import time | KEPT in part — `enabledconf` is used by entry points `file()` (line 2433: `enabledconf["mongodb"]`) and `vtupload()` (line 2928: `enabledconf["vtupload"]`). `on_demand_conf` is used only by deleted `on_demand` and `report`. | keep `enabledconf` build loop; drop `on_demand_conf` |
| 160-163 | `if enabledconf["mongodb"]: from bson.objectid import ObjectId; from dev_utils.mongodb import mongo_aggregate, mongo_delete_data, mongo_find, mongo_find_one, mongo_update_one` | conditional mongo imports | LOST safely — none of these names is referenced in the keep-set (only `procdump`, `search`, `remove`, `comments`, etc. use them, and those are deleted). The `enabledconf["mongodb"]` flag itself is still consulted by `file()` but only to gate `_file_search_all_files()` — that helper is in the keep-set and references `mongo_find` directly. So we DO need `mongo_find` if we keep `_file_search_all_files`. | KEEP `mongo_find` only; or inline the search helper to avoid the import. See § 1.4 note. |
| 165-174 | `es_as_db = False; essearch = False; if enabledconf["elasticsearchdb"]: from dev_utils.elasticsearchdb import ...; es = elastic_handler` | conditional ES imports | LOST safely — keep-set references none of `es_as_db`, `essearch`, `es`, `get_analysis_index`, `get_calls_index`, `get_query_by_info_id` | delete |
| 176-179 | `DISABLED_WEB = True; if enabledconf["mongodb"] or enabledconf["elasticsearchdb"]: DISABLED_WEB = False` | binds flag | LOST safely — only `index`, `report` reference it | delete |
| 181 | `db: TasksMixIn = Database()` | instantiates Database singleton (opens DB engine at import) | LOST safely — keep-set never references `db`. Verified by AST walk: `file`, `vtupload`, `filereport`, `full_memory_dump_file`, `full_memory_dump_strings`, `statistics_data` are all filesystem / mongo / VT / web_utils calls; none touches `db`. | delete |
| 183-191 | `anon_not_viewable_func_list = (...)` tuple including `"file"`, `"statistics_data"`, etc. | binds list | KEPT — `conditional_login_required.__call__` (line 201) checks function name against this list; `file` and `statistics_data` are entries. | keep |

### 1.2 Module-level globals (constants, Config singletons, mutable)

Already enumerated in § 1.1. External-importer scan:

```bash
grep -rn "from analysis\.views import\|from web\.analysis\.views import\|analysis_views\.\|analysis\.views\." \
    web/ lib/ 2>/dev/null | grep -v __pycache__ | grep -v '/analysis/views\.py:'
```

Result — only `web/web/urls.py` imports the module, and it imports
**only** the six binary entry-point function objects:

```
web/web/urls.py:5:    from analysis import views as analysis_views
web/web/urls.py:52:    re_path(... analysis_views.statistics_data ...)
web/web/urls.py:54:    re_path(... analysis_views.file ...)
web/web/urls.py:56:    re_path(... analysis_views.vtupload ...)
web/web/urls.py:58:    re_path(... analysis_views.filereport ...)
web/web/urls.py:59:    re_path(... analysis_views.full_memory_dump_file ...)
web/web/urls.py:61:    re_path(... analysis_views.full_memory_dump_strings ...)
```

`web/analysis/urls.py` also imports `from analysis import views`, but
that file is no longer included anywhere (the corresponding
`include("analysis.urls")` was already dropped in commit `6ece5fa4`,
"refactor(urls): drop legacy include(analysis|submission|compare|audit)"
). It will be deleted as part of D2.

No external module imports `processing_cfg`, `reporting_cfg`,
`integrations_cfg`, `web_cfg`, `enabledconf`, `db`, `HAVE_*`, or any
other top-level name from `analysis.views`. Their lifetime is entirely
internal.

### 1.3 Decorators applied at top level (not inside def)

`grep -nE "^@" web/analysis/views.py` returns ~165 hits, all positioned
above a `def` or `class`. None modify global state. The
`@register.filter` style top-level mutation (seen in `audit/views.py`,
§ 4) does **not** appear in `analysis/views.py`. Class-level mutation:
none. Decorator audit: clean.

### 1.4 Keep-set graph

Entry points (per `web/web/urls.py`):

- `file` (L2307)
- `vtupload` (L2927)
- `filereport` (L2580)
- `full_memory_dump_file` (L2625)
- `full_memory_dump_strings` (L2645)
- `statistics_data` (L2965)

Transitive keep-set computed via AST walk
(`tests/...` style helper in this audit's tooling section above):

```
6 entries + 1 class + 2 helpers + 7 module vars = 16 names
```

| Line | Kind | Name | Why kept |
|---|---|---|---|
| 86 | var | `integrations_cfg = Config("integrations")` | `vtupload` reads `integrations_cfg.virustotal.apikey` (L2928, L2945) |
| 87 | var | `web_cfg = Config("web")` | `_path_safe` reads `web_cfg.security.check_path_safe`; `file` reads `web_cfg.zipped_download.download_all` (L2328, L2433) |
| 140 | var | `USE_SEVENZIP` | `file` checks at L2471 |
| 143 | var | `SEVENZIP_PATH` | `file` uses at L2473 (NOTE: AST keep-set missed this because it's only assigned inside the `if reporting_cfg.compression.compressiontool == "7zip":` branch; it must be added explicitly. Without it, `file()` raises `NameError` at runtime when 7zip is enabled.) |
| 146 | var | `enabledconf` | `file` reads `enabledconf["mongodb"]`; `vtupload` reads `enabledconf["vtupload"]`. The build-loop at L148-158 must therefore also be retained. |
| 183 | var | `anon_not_viewable_func_list` | referenced by `conditional_login_required.__call__` (L201) |
| 195 | class | `conditional_login_required` | every entry-point is decorated with it |
| 208 | func | `_path_safe` | called by `file` (L2464), `procdump` (deleted), `full_memory_dump_file` (L2629), `full_memory_dump_strings` (L2651), `vtupload` (L2942), `pcapstream` (deleted), `filereport` (L2613) |
| 2242 | var | `zip_categories` | referenced by `file` (L2317, 2448, 2468) — NOTE: not surfaced earlier in this doc; defined alongside `category_map` near `_file_search_all_files`. After the keep-set rewrite, both should be moved to the top of the file (canonical location) — they're effectively constants. |
| 2256 | var | `category_map` | referenced by `file` (L2331) |
| 2263 | func | `_file_search_all_files` | called by `file` (L2434) when category is `capeyarazipall`. Internally calls `mongo_find` and `path_exists`. |
| 2307 | func | `file` | entry |
| 2580 | func | `filereport` | entry |
| 2625 | func | `full_memory_dump_file` | entry |
| 2645 | func | `full_memory_dump_strings` | entry |
| 2927 | func | `vtupload` | entry |
| 2965 | func | `statistics_data` | entry |

Imports the keep-set requires (31 names, all still inside `lib/`,
`django`, or pure-stdlib):

| Line | Import | Used by |
|---|---|---|
| 5 | `import base64` | `vtupload` (L2951) |
| 9 | `import os` | every entry point |
| 10 | `import subprocess` | `file` (7zip branch L2476-2478) |
| 12 | `import tempfile` | `file` (L2497) |
| 16 | `from io import BytesIO` | `file` (L2485) |
| 17 | `from pathlib import Path` | `file` (L2501), `filereport` (L2616) |
| 19 | `from wsgiref.util import FileWrapper` | `file`, `full_memory_dump_file`, `full_memory_dump_strings` |
| 21 | `from django.conf import settings` | every entry point (decorators + ZIP_PWD + TEMP_PATH) |
| 22 | `from django.contrib.auth.decorators import login_required` | every entry point |
| 24 | `HttpResponse, StreamingHttpResponse` | `file`, `filereport`, `full_memory_dump_*` |
| 25 | `from django.shortcuts import render` | every entry point |
| 26 | `from django.views.decorators.csrf import csrf_exempt` | `file` |
| 27 | `from django.views.decorators.http import require_safe` | `file`, `filereport`, `full_memory_dump_*` |
| 28 | `from rest_framework.decorators import api_view` | `file` |
| 40 | `PcapToNg` | `file` (L2372) |
| 42 | `Config` | constructs the four `*_cfg` singletons |
| 43 | `ANALYSIS_BASE_PATH, CUCKOO_ROOT` | every entry that builds storage paths |
| 44 | `path_exists, path_safe` | `file`, `filereport`, `full_memory_dump_*`, `_path_safe` |
| 46 | `category_all_files, my_rate_minutes, my_rate_seconds, perform_search, rateblock, statistics` | `file` decorators + body, `statistics_data` body |
| 55 | `ratelimit` (try/except chain at L51-57) | `file` decorators |
| 68 | `requests` | `vtupload` |
| 75 | `pyzipper` | `file` (L2486-2492) |

Imports the keep-set does **NOT** require (all safe to drop):

- `collections`, `datetime`, `json`, `sys`, `zipfile`, `quote`, `suppress`, `lru_cache`
- `BadRequest`, `PermissionDenied`, `JsonResponse`, `HttpResponseRedirect`, `redirect`, `require_POST`
- `pymongo.errors.DocumentTooLarge` (and its `MONGO_DOCUMENT_TOO_LARGE_ERRORS` constant)
- `network` (modules.processing.network)
- `delete_folder`, `yara_detected`, `Database`, `TasksMixIn`, `TASK_PENDING`, `Task`, `CHUNK_CALL_SIZE`
- `audit_log.helpers as audit`, `disable_user`
- `re2`/`re`
- ALL on-demand integration imports (`flare_capa`, `strings`, `evtx`, `vba2graph`, `XLMMacroDeobf`, `virustotal`, `binGraph`, `floss`)
- `bson.objectid.ObjectId`, all `mongo_*` **except** `mongo_find`
- ALL `dev_utils.elasticsearchdb` imports

Caveat / extra wiring: `_file_search_all_files` (L2263) calls
`mongo_find` (line ~2293, gated by `enabledconf["mongodb"]`). If the
slimmed file keeps that helper, retain `from dev_utils.mongodb import
mongo_find` inside the same `if enabledconf["mongodb"]:` block. If
`capeyarazipall` is never used by SPA users, an alternative is to drop
`_file_search_all_files` and short-circuit `category == "capeyarazipall"`
to a 404 — that removes the entire `dev_utils.mongodb` dependency from
the slimmed views.py.

---

## 2. web/submission/views.py

826 lines. Entire app slated for D3 deletion.

### 2.1 Module-level imports / sys.path

| Line | Statement | Side effect | Lost on delete? | Action |
|---|---|---|---|---|
| 6-18 | stdlib + Django imports | name binding | LOST with file | n/a |
| 20 | `sys.path.append(settings.CUCKOO_PATH)` | mutates sys.path | LOST safely (other apps already do same append) | n/a |
| 21 | `from uuid import NAMESPACE_DNS, uuid3` (placed AFTER sys.path append) | name binding | LOST with file | n/a |
| 23-40 | `lib.cuckoo.*` imports including `download_file`, `download_from_3rdparty`, `get_options`, `parse_request_arguments`, `process_new_dlnexec_task`, `Database`, `_load_socks5_operational`, `vpns` | name binding | LOST with file | n/a |
| 53 | `from urllib3 import disable_warnings` then call | mutates urllib3 warning filters globally | KEPT — but apiv3 already disables warnings independently in its own request paths; the warning suppression will be lost. Verify if any apiv3 codepath relies on this. (Search for `disable_warnings` in apiv3: zero hits.) | LOST safely; apiv3 doesn't depend on it |

### 2.2 Module-level globals

| Line | Name | Value | Imported externally? | Action |
|---|---|---|---|---|
| 43 | `cfg = Config("cuckoo")` | Config singleton | none (grep below) | LOST safely |
| 44 | `routing = Config("routing")` | Config singleton | none | LOST safely |
| 45 | `repconf = Config("reporting")` | Config singleton | none | LOST safely |
| 46 | `distconf = Config("distributed")` | Config singleton | none | LOST safely |
| 47 | `processing = Config("processing")` | Config singleton | none | LOST safely |
| 48 | `aux_conf = Config("auxiliary")` | Config singleton | none | LOST safely |
| 49 | `web_conf = Config("web")` | Config singleton | none directly, but `get_form_data()` body reads it (L215, 233, 240) — see below | LOST with file BUT consumers of `get_form_data` via apiv3 will fail unless we port |
| 51 | `db = Database()` | Database singleton | none directly, but `get_form_data()` body uses it (L226-227) | LOST with file BUT consumers of `get_form_data` via apiv3 will fail |
| 53-55 | `disable_warnings()` call | urllib3 warning suppression | n/a | LOST safely |
| 57 | `logger = logging.getLogger(__name__)` | logger | none | LOST safely |
| 59-63 | `allowed_functions = {"sorted": sorted, "set": set, "os.path.join": os.path.join}` | sandbox whitelist for `parse_expr` | none — only `parse_expr` (deleted) reads it | LOST safely |

External-importer scan:

```bash
grep -rn "from submission\.\|import submission" web/ lib/ utils/ \
  | grep -v __pycache__ | grep -v '/submission/'
```

Hits:

- `web/services/submission_service.py:77` — `from submission.views import get_form_data as upstream_get_form_data` (RISK)
- `web/analysis/forms.py:6` — `from submission.models import Comment, Tag` (BROKEN ALREADY — `web/submission/models.py` does not exist; the import would `ImportError` if `analysis.forms` were imported. It is not — `grep -rn 'from analysis.forms' web/` returns zero hits — so the dead line never executes. Still, deleting `web/submission/` will not change this.)

### 2.3 Decorators at top level

`@conditional_login_required(...)` only — all on `def` blocks. No
top-level mutation. No template library. No signal hookup.

### 2.4 The `get_form_data` import chain (RISK)

Call graph from apiv3 down:

```
apiv3.views.submission_form_data           (web/apiv3/views.py:203-204)
  -> services.submission_service.get_form_data()   (web/services/submission_service.py:42)
       -> submission.views.get_form_data()          (web/services/submission_service.py:77, lazy import)
            -> submission.views.get_enabled_platforms()      (L180)
            -> submission.views.get_lib_common_constants(p)  (L132)
            -> submission.views.correlate_platform_packages  (L190)
            -> submission.views.get_package_info             (L142)
                 -> submission.views.parse_ast (L116) -> submission.views.parse_expr (L66)
                      -> submission.views.allowed_functions (L59) [module global]
            -> module-level db.list_machines()               (L226, db = L51)
            -> module-level web_conf.linux.enabled / .package_exclusion / .all_vms (L215, 233, 240, ...)
```

Names the chain transitively requires from `submission/views.py`:

- `get_form_data` (L206)
- `get_enabled_platforms` (L180)
- `get_lib_common_constants` (L132)
- `correlate_platform_packages` (L190)
- `get_package_info` (L142)
- `parse_ast` (L116), `parse_expr` (L66)
- `allowed_functions` (L59)
- `db = Database()` (L51)
- `web_conf = Config("web")` (L49)

Plus the imports those bodies need (`os`, `ast`, `textwrap`,
`settings`, `Database`, `Config`, plus `lib.cuckoo.common.web_utils`
helpers). The simplest re-wiring: move all of the above into
`web/services/submission_service.py` itself (a few hundred lines of
self-contained logic) and drop the lazy import at line 77. After that,
`web/submission/` can be removed without touching apiv3.

### 2.5 Definitive answer

**Does any code import `cfg`, `routing`, `repconf`, `distconf`,
`processing`, `aux_conf`, `web_conf`, `db`, or any other top-level name
from `submission.views`?**

Yes — exactly one import: `web/services/submission_service.py:77`,
which imports the *function* `get_form_data` (which transitively reads
`web_conf` and `db`). No other module in the repository imports any
top-level name from `submission.views` or `submission.*`. Verified with:

```bash
grep -rn "from submission\.\|import submission" web/ lib/ utils/ \
  | grep -v __pycache__ | grep -v '/submission/'
```

→ 2 hits, listed in § 2.2. The `analysis/forms.py:6` hit is dead code
(no consumer) and points to a never-existing `submission.models`.

---

## 3. web/compare/views.py

159 lines. Entire app slated for D6 deletion.

### 3.1 Module-level imports / sys.path

| Line | Statement | Side effect | Lost on delete? | Action |
|---|---|---|---|---|
| 5-10 | stdlib + Django imports | name binding | LOST with file | n/a |
| 12 | `sys.path.append(settings.CUCKOO_PATH)` | mutates sys.path | LOST safely (redundant) | n/a |
| 14-15 | `import lib.cuckoo.common.compare as compare`, `from lib.cuckoo.common.config import Config` | name binding | LOST with file | n/a |

### 3.2 Module-level globals

| Line | Name | Value | Imported externally? | Action |
|---|---|---|---|---|
| 17 | `enabledconf = {}` | mutable dict | NO — verified | LOST safely |
| 18-23 | `confdata = Config("reporting").get_config()` + for-loop populating `enabledconf` | reads reporting.conf at import | NO | LOST safely |
| 25-26 | `if enabledconf["mongodb"]: from dev_utils.mongodb import mongo_find, mongo_find_one` | conditional import | NO | LOST safely |
| 28-37 | `es_as_db`, `essearch`, `es` (conditional ES setup) | conditional flags + handler | NO | LOST safely |
| 41-49 | `class conditional_login_required` | duplicate of analysis/audit copy | NO | LOST safely |

External-importer scan:

```bash
grep -rn "from compare\.\|import compare" web/ lib/ \
  | grep -v __pycache__ | grep -v '/compare/'
```

→ zero hits. Even `lib.cuckoo.common.compare` (different module — that's
the engine helper) is unrelated to `web.compare`.

`compare` IS in `INSTALLED_APPS` (`web/web/settings.py:252`). Removing
the directory without removing the entry would crash Django startup
(`ModuleNotFoundError`). D6 must drop both. (This is mechanical — out
of scope for this audit but flagged for the executor.)

### 3.3 Definitive answer

**Is `enabledconf` (or any other top-level name) used externally?**

No. `web/compare/views.py` is fully self-contained. The only consumer
of any of its names is `web/compare/urls.py` (already not included in
`web/web/urls.py`) and that file will be deleted alongside.

---

## 4. web/audit/views.py

495 lines. Entire app slated for D5 deletion. **Distinct from
`web/audit_log/`** which is a separate, surviving Django app
(`web/audit_log/` has `apps.py`, `models.py`, `signals.py`,
`migrations/` — no `templatetags/`, no `views.py`).

### 4.1 Module-level imports / sys.path

| Line | Statement | Side effect | Lost on delete? | Action |
|---|---|---|---|---|
| 1-15 | stdlib + Django imports | name binding | LOST with file | n/a |
| 17 | `register = template.Library()` | instantiates a Django template library object | see § 4.4 below | LOST safely |
| 19 | `sys.path.append(settings.CUCKOO_PATH)` | mutates sys.path | LOST safely (redundant) | n/a |
| 21 | `logger = logging.getLogger(__name__)` | logger | none | LOST safely |
| 23-29 | `lib.cuckoo.*` imports (`Config`, `TestLoader`, `Database`, `AuditsMixIn`, `TestSession`, `TASK_PENDING`, `Task`, `_utcnow_naive`, `TestRun`, `TEST_*` constants) | name binding | LOST with file | n/a |
| 31-39 | Triple-quoted commented-out block (rate-limit fallback) | none — not executed | LOST safely | n/a |

### 4.2 Module-level globals

| Line | Name | Value | Imported externally? | Action |
|---|---|---|---|---|
| 41 | `SESSIONS_PER_PAGE = 10` | constant | NO | LOST safely |
| 42 | `AUDIT_PACKAGES_ROOT = os.path.join(settings.CUCKOO_PATH, "tests", "audit_packages")` | constant | NO | LOST safely |
| 43-46 | Four `*_cfg = Config(...)` singletons | reads conf files at import | NO | LOST safely |
| 47 | `db: AuditsMixIn = Database()` | Database singleton | NO | LOST safely |
| 49-50 | `anon_not_viewable_func_list = ()` (empty) | constant | NO | LOST safely |

External-importer scan:

```bash
grep -rn "from audit\.\|import audit\b" web/ lib/ \
  | grep -v __pycache__ | grep -v '/audit/' | grep -v audit_log | grep -v audit_utils
```

→ zero hits. `web/audit/` has no consumers outside itself. Note: the
`audit` app is **not** in `INSTALLED_APPS` (verified
`web/web/settings.py:237-276` — only `audit_log` is). So Django never
auto-loaded its templatetags directory anyway, and never fired any
ready hooks in `apps.py` (the file doesn't even have an `apps.py`).

### 4.3 Decorators at top level

| Line | Statement | Action |
|---|---|---|
| 338 | `@register.filter` (above `def get_item(dictionary, key)`) | mutates the module-level `template.Library()` instance — but see § 4.4 |

### 4.4 Django template library

`register = template.Library()` is set at line 17 and the only
registration is `@register.filter` at line 338, decorating `get_item`.

Critical question: **does any surviving template `{% load %}` this
library?**

Answer: **No.** Verified two ways.

1. Django auto-discovery rule: a `template.Library()` instance is
   exposed to templates only if it lives in `<app>/templatetags/<name>.py`
   AND `<app>` is in `INSTALLED_APPS`. The `register` here lives in
   `web/audit/views.py`, not in a `templatetags/` directory. There is
   no `web/audit/templatetags/` directory (`ls web/audit/templatetags/`
   → "No such file or directory"). The `audit` app is not in
   `INSTALLED_APPS`. So Django has no path by which a template could
   `{% load views %}` from this app.

2. Empirical scan of every surviving template:
   ```bash
   grep -rEn "\{% load " web/templates/
   ```
   Returns 24 hits, every one of which loads only `i18n`, `static`,
   `account`, or `socialaccount` — i.e. Django builtins or allauth
   builtins. No surviving template loads `views`, `audit`, `audit_tags`,
   or any custom library.

Conclusion: the `@register.filter`-decorated `get_item` in
`web/audit/views.py:338` is unreachable from any template. Deleting
the file removes a never-used filter — no template-tag risk.

For completeness, neither does `web/audit_log/` register any template
tags (no `templatetags/` subdirectory there either). The two apps'
naming similarity is purely coincidental.

### 4.5 Definitive answer

**Does any survivor template use an audit template tag?** No.
**Verified by:** (a) no `web/audit/templatetags/` directory exists;
(b) `audit` is absent from `INSTALLED_APPS`; (c) no `{% load %}` in
`web/templates/**/*.html` references anything beyond Django and
allauth builtins.

---

## 5. web/dashboard/views.py

99 lines. Entire app slated for D4 deletion (the SPA shell now owns
`/dashboard*` per `web/web/urls.py:90`).

### 5.1 Module-level imports / sys.path

| Line | Statement | Side effect | Lost on delete? | Action |
|---|---|---|---|---|
| 5-10 | stdlib + Django imports | name binding | LOST with file | n/a |
| 12 | `from lib.cuckoo.core.data.tasking import TasksMixIn` | name binding | LOST with file | n/a |
| 14 | `sys.path.append(settings.CUCKOO_PATH)` | mutates sys.path | LOST safely (redundant) | n/a |
| 16-28 | `lib.cuckoo.*` imports (`top_detections`, `Database`, `TASK_*` constants) | name binding | LOST with file | n/a |

### 5.2 Module-level globals

None except the `conditional_login_required` class duplicated from
analysis/views (line 32 onwards — confirmed by the body of the file).
The `db: TasksMixIn = Database()` instantiation is **inside** `def
index(request)` at line 52, not at module scope — a happy quirk that
makes this file the cheapest to delete.

### 5.3 Decorators at top level

`@require_safe` and `@conditional_login_required(...)` only — both on
`def index`. No top-level mutation.

### 5.4 External-importer scan

```bash
grep -rn "from dashboard\.\|import dashboard" web/ lib/ \
  | grep -v __pycache__ | grep -v '/dashboard/'
```

→ zero hits. The only references to `dashboard` in
`web/web/urls.py` are the comment on lines 46-49 and the SPA-claim
`re_path(r"^dashboard(?:/.*)?$", spa_view.spa_index, ...)` at line 90 —
neither imports the Python module. `dashboard` is **not** in
`INSTALLED_APPS`.

### 5.5 Definitive answer

`web/dashboard/views.py` is the simplest of the five — pure leaf, no
external consumers, no module-level singletons (everything is inside
`def index`), no template tags, no signals. D4 may delete the whole
directory.

---

## 6. Recommended pre-deletion fixes

For Phase D to proceed safely, two pre-deletion changes are required.
Both target the submission deletion only; analysis / compare / audit /
dashboard deletions need no advance fixup.

### 6.1 Port `get_form_data` into `web/services/submission_service.py` (BEFORE D3)

**Risk:** apiv3 endpoint `submission_form_data` calls
`services.submission_service.get_form_data()` which lazy-imports
`submission.views.get_form_data` at line 77 of the service file. After
D3 deletes `web/submission/`, the lazy import will `ImportError`
inside the `try/except` and silently return an empty form
(`packages_raw = []`, `machines_raw = []`). The frontend will display
an empty MACHINE / PACKAGE dropdown with no error visible — a
production regression hidden by the broad `except Exception:` at line
80.

**Fix:** Inline the seven names into `submission_service.py`. Roughly
(pseudo-diff):

```text
web/services/submission_service.py
  + import ast, os, textwrap
  + from django.conf import settings
  + from lib.cuckoo.common.config import Config
  + from lib.cuckoo.core.database import Database
  +
  + _web_conf = Config("web")
  + _db = Database()
  +
  + _allowed_functions = {"sorted": sorted, "set": set, "os.path.join": os.path.join}
  +
  + def _parse_expr(...): ...        # ported from submission/views.py:66
  + def _parse_ast(...): ...         # ported from submission/views.py:116
  + def _get_lib_common_constants(...): ...  # L132
  + def _get_package_info(...): ...           # L142
  + def _get_enabled_platforms(...): ...      # L180
  + def _correlate_platform_packages(...): ... # L190
  + def _upstream_get_form_data(): ...        # body of L206 get_form_data
  -
  - try:
  -     from submission.views import get_form_data as upstream_get_form_data
  -     packages_raw, machines_raw = upstream_get_form_data()
  - except Exception:
  -     ...
  + try:
  +     packages_raw, machines_raw = _upstream_get_form_data()
  + except Exception:
  +     ...
```

Total LOC moved: roughly 200 lines (lines 59-243 of submission/views.py).
Changes nothing semantically — exact-port — keep the function bodies
byte-identical.

### 6.2 Drop the dead import in `web/analysis/forms.py` (BEFORE D3)

**Risk:** line 6 reads `from submission.models import Comment, Tag`.
The line is already broken (no `submission/models.py`) but it is
currently never executed because nothing imports `analysis.forms`. If
some future change imports `analysis.forms` after D3, the user gets
`ModuleNotFoundError: No module named 'submission'` (worse than the
current `ImportError: cannot import name 'Comment' from 'submission'`).

**Fix:** Either delete `web/analysis/forms.py` outright (it is
already dead — `grep -rn "from analysis.forms" web/` returns zero
hits) or remove the broken import and the now-unused `CommentForm`
and `TagForm` classes. Lowest-risk option: delete the file.

---

## Appendix A. Verification commands used

```bash
# Module-level scans
awk '/^(def |class |@)/ {exit} {print NR": "$0}' web/<app>/views.py
grep -nE "^[A-Z][A-Z0-9_]+ = |^[a-z_]+ = " web/<app>/views.py
grep -nE "^@" web/<app>/views.py

# External-importer scans
grep -rn "from analysis\.views\|analysis_views\." web/ lib/ \
  | grep -v __pycache__ | grep -v '/analysis/views\.py:'
grep -rn "from submission\.\|import submission" web/ lib/ utils/ \
  | grep -v __pycache__ | grep -v '/submission/'
grep -rn "from compare\.\|import compare" web/ lib/ \
  | grep -v __pycache__ | grep -v '/compare/'
grep -rn "from audit\.\|import audit\b" web/ lib/ \
  | grep -v __pycache__ | grep -v '/audit/' | grep -v audit_log
grep -rn "from dashboard\.\|import dashboard" web/ lib/ \
  | grep -v __pycache__ | grep -v '/dashboard/'

# Template-tag survivor scan
grep -rEn "\{% load " web/templates/
ls web/audit/templatetags/ web/audit_log/templatetags/ \
   web/submission/templatetags/ web/compare/templatetags/ \
   web/dashboard/templatetags/ 2>&1

# INSTALLED_APPS verification
sed -n '237,276p' web/web/settings.py
```

## Appendix B. Keep-set AST walk script

The graph in § 1.4 was computed by an AST walk equivalent to:

```python
import ast
src = open('web/analysis/views.py').read()
tree = ast.parse(src)

top_level = {}
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        top_level[node.name] = node
    elif isinstance(node, ast.Assign):
        for tgt in node.targets:
            if isinstance(tgt, ast.Name):
                top_level[tgt.id] = node

ENTRY = ["file", "vtupload", "filereport", "full_memory_dump_file",
         "full_memory_dump_strings", "statistics_data"]
keep, queue = set(ENTRY), list(ENTRY)
while queue:
    n = queue.pop()
    if n not in top_level: continue
    for sub in ast.walk(top_level[n]):
        if isinstance(sub, ast.Name) and sub.id in top_level and sub.id not in keep:
            keep.add(sub.id); queue.append(sub.id)
print(sorted(keep))
```

Output yields 16 names; manual inspection adds `SEVENZIP_PATH` (assigned
inside an `if` branch, missed by the simple AST walk) for a final
keep-set of 17 module-level names.
