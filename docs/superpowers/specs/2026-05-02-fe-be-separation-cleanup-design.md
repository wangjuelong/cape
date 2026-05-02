# FE/BE 完全分离清理设计

**Status:** approved-pending-review
**Date:** 2026-05-02
**Branch:** refactor/web-spa
**Architecture choice:** Option A (Django + DRF 保留)，不引入 token 鉴权变更，不引入 FastAPI 边车

---

## 1. 目标 (Goal)

在不改变任何对外功能（用户可见行为、apiv2 token API、SPA 渲染结果、CSS/JS 资源加载）的前提下，移除上游 Bootstrap 模板及其 server-rendered HTML 兜底路径，使 SPA 唯一通过 `/api/v3/*` 与后端通信，达成"前后端代码物理分离 + Django 仅负责 API + admin + auth"的目标状态。

---

## 2. 关键发现 (Discovery)

调研结果重塑了任务范围：

1. **apiv3 已经全部就位**。`/api/v3/system/submission-form/`、`/api/v3/tasks/`、`/api/v3/search/`、`/api/v3/statistics/<days>/`、`/api/v3/compare/<l>/[<r>/]`、`/api/v3/reports/<id>/{summary,behavior,static,network,dropped,payloads,screenshots,attack,config}/` 全部已实现。
2. **SPA 的 7 个 `upstream-*-scrape.ts` 模块是 vanilla CAPEv2 兼容性 fallback**。每个 hook 形如 `try { fetchApiv3() } catch { adapt(scrape()) }`，目的是支持 SPA 指向"未装 apiv3 的原版 CAPEv2"。我们的部署始终自带 apiv3，scrape 路径在 prod 永不 fire。
3. **核心工作**因此是"代码删除 + 收口"，不是"endpoint 新建"。

---

## 3. 架构影响 (Architecture Impact)

### 当前形态

```
SPA ─try─> /api/v3/*  (主)
    └catch─> /_upstream/*  ─> Django HTML view (analysis|submission|compare|...)
                              ↳ render 上游 Bootstrap template
                                ↳ 解析回 SPA 类型
```

### 目标形态

```
SPA ──────> /api/v3/*  (唯一)
            ↑
Django: API + admin + allauth + audit_log + binary 下载 (file/full_memory/filereport/vtupload)
        ↳ 不再 render 任何业务 HTML 模板
```

### 鉴权模型（不变）

- 浏览器 SPA：Django session cookie (`sessionid`) + CSRF（保留 `CSRF_COOKIE_HTTPONLY=False` 让 axios 取 token）
- 非浏览器 / agent / CI：apiv2 + apiv3 的 DRF Token / API key（不动）
- allauth 登录页 `/accounts/login/`：保留
- audit_log 信号驱动捕获：保留

---

## 4. 阶段切分

`A → B → C → D` 顺序执行，每阶段独立 commit，独立可回滚。每一阶段的删除都依赖前一阶段已合并 + e2e 全绿。

| Phase | 范围 | 风险 | 体量 |
|---|---|---|---|
| **A** | FE scrape fallback 移除 + apiv3 形状 diff 审计 + BE 补缺 | 低 | ~15 文件 |
| **B** | BE URL 收口（删 `_upstream/*` shim、删 `include(analysis\|submission\|compare\|audit)`） | 低 | 1 文件 |
| **C** | 模板 + 静态资源删除 | 中 | 200+ 文件，~5 MB |
| **D** | Python views 外科手术（拆 binary-only / 删 HTML view 模块） | 中-高 | ~10 文件 |

---

## 5. Phase A — Frontend scrape 移除

### A.0 (前置任务) apiv3 形状 diff 审计

**对象**：8 个 hook 的 `try` 路径返回值 vs `catch` 路径 `adapter` 返回值，逐字段对比。

**输出文档**：`docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md`，每个 hook 一节：
- hook 名称
- apiv3 endpoint
- adapter 当前补偿的字段
- 形状差异（apiv3 缺哪些字段、字段名/类型不一致）
- 修复决策（① 改 apiv3 让 SPA 直接吃；② 改 SPA 类型；③ 字段允许 null/空）

**修复策略**：差异点优先在 apiv3 BE 补齐（保持 SPA 类型不变）；只在补齐成本极高时才改 SPA 类型。允许的 BE 改动属于"修复 apiv3 不完整"，不属于"功能改动"。

**Gate**：审计 + 修复全部完成、apiv3 endpoint 实测能完整满足 SPA 的所有读路径，A 才能进入下一步。

### A.1 修改 8 个 hook（移除 try/catch fallback）

```
useReport.ts          → 直接 fetchReportSummary，无 fallback
useReportTabs.ts      → 直接调对应 apiv3 endpoint
useBehavior.ts        → 直接 fetchBehavior
useCompare.ts         → 直接 fetchCompareCandidates / fetchCompareDiff
useSearch.ts          → 直接 fetchSearch
useStatistics.ts      → 直接 fetchStatistics
useSubmissionForm.ts  → 直接 fetchSubmissionFormData
useAnalysisScrape.ts  → 整体删除（已被 useTasks 取代）
```

每个 hook 改动后用 unit test 锁住"调用 apiv3"和"返回类型"。

### A.2 删除 7 个 scrape 模块

```
frontend/app/src/lib/api/upstream-scrape.ts
frontend/app/src/lib/api/upstream-report-scrape.ts
frontend/app/src/lib/api/upstream-compare-scrape.ts
frontend/app/src/lib/api/upstream-search-scrape.ts
frontend/app/src/lib/api/upstream-statistics-scrape.ts
frontend/app/src/lib/api/upstream-analysis-scrape.ts
frontend/app/src/lib/api/upstream-pending-scrape.ts
```

外加任何 only-by-scrape 引用的 helper（HiddenMirror.tsx 中的 spec scrape comment 等）。

### A.3 验证

- `npm run typecheck && npm run build` 通过
- `npx playwright test` 全套通过
- 192.168.1.6 部署 + 手动浏览：Recent / Pending / Search / Submit / Statistics / Compare / Tasks/<id> / Audit / Behavior tab —— 视觉一致

---

## 6. Phase B — Backend URL 收口

### B.1 `web/web/urls.py` 删除以下行

```python
# _upstream/* shim — SPA 不再 scrape
re_path(r"^_upstream/submit/?$", ...)
re_path(r"^_upstream/analysis/?$", ...)
re_path(r"^_upstream/analysis/pending/?$", ...)
re_path(r"^_upstream/analysis/search/?$", ...)
re_path(r"^_upstream/analysis/(?P<task_id>\d+)/?$", ...)
re_path(r"^_upstream/statistics/(?P<days>\d+)/?$", ...)
re_path(r"^_upstream/compare/(?P<left_id>\d+)/?$", ...)
re_path(r"^_upstream/compare/(?P<left_id>\d+)/(?P<right_id>\d+)/?$", ...)

# include 模式 — 不再被浏览器或 _upstream/* 命中
re_path(r"^analysis/", include(analysis))
re_path(r"^submit/", include(submission))
re_path(r"^compare/", include(compare))
re_path(r"^audit/", include(audit), name="audit")  # 仅保留 SPA 的 spa-audit re_path

# 顶部 import 清理
from analysis import urls as analysis
from submission import urls as submission
from compare import urls as compare
from audit import urls as audit
```

### B.2 保留

```python
# 顶层 binary 下载 endpoint —— SPA 仍在用
re_path(r"^file/(?P<category>\w+)/(?P<task_id>\d+)/(?P<dlfile>\w+)/$", analysis_views.file, ...)
re_path(r"^vtupload/...", analysis_views.vtupload, ...)
re_path(r"^filereport/(?P<task_id>\w+)/(?P<category>\w+)/$", analysis_views.filereport, ...)
re_path(r"^full_memory/(?P<analysis_number>\w+)/$", analysis_views.full_memory_dump_file, ...)
re_path(r"^full_memory_strings/(?P<analysis_number>\w+)/$", analysis_views.full_memory_dump_strings, ...)
re_path(r"^statistics/(?P<days>\d+)/$", analysis_views.statistics_data, name="statistics_data")

# admin / auth / API / SPA catchall 全部保留
re_path(r"^guac/", ...)
path("accounts/", include("allauth.urls"))
re_path(r"^admin/", admin.site.urls)
re_path(r"^apiv2/", include(apiv2))
re_path(r"^api/v3/", include(apiv3))
path("robots.txt", ...)
re_path(r"^audit(?:/.*)?$", spa_view.spa_index, name="spa-audit")  # phase-1 SPA audit
re_path(r"^submit(?:/.*)?$", spa_view.spa_index, ...)
re_path(r"^compare(?:/.*)?$", spa_view.spa_index, ...)
... 等等所有 spa_view.spa_index 路由
```

### B.3 删除上游 url-name reverses 检查

某些 upstream 模板可能 `{% url 'submission' %}`/`{% url 'compare_left' %}` —— 这些 url 名称随 `include` 一起消失。需要 `grep` 确认没有保留模板（admin/account/socialaccount/error.html）引用它们；若有则改为硬编码或删除该模板片段。

### B.4 验证

- `pytest tests/` 全套通过（除 test_views_legacy* 类测试外）
- e2e 重跑（应与 A.3 相同结果）
- 手动访问 `/_upstream/submit/` 应得 404（SPA catchall 兜底）

---

## 7. Phase C — 模板 + 静态资源删除

### C.1 删除整个目录 / 文件

```
web/templates/analysis/        # ~30 个上游 HTML 模板
web/templates/submission/      # ~10
web/templates/compare/         # ~5
web/templates/audit/           # phase 1 SPA 已接管
web/templates/dashboard/       # ~3
web/templates/auth/            # 上游 self-managed login，被 allauth 替代
web/templates/header.html
web/templates/footer.html
web/templates/standalone_error.html
web/templates/success.html
web/templates/success_simple.html
web/templates/success_vtup.html
web/templates/statistics.html

frontend/web-design/cape-design.html   # 单文件 mockup
```

### C.2 保留

```
web/templates/admin/         # 自定义 admin 模板（如有）
web/templates/account/       # allauth login / signup / password
web/templates/socialaccount/ # allauth 社交登录
web/templates/error.html     # web/views.py handler403 在用
web/templates/base.html      # admin/account 可能 extend
web/templates/robots.txt     # 顶层 TemplateView 在用
```

### C.3 `web/static/` 处理（需先 grep）

**先做**：
```bash
grep -rn "{% static '" web/templates/{admin,account,socialaccount}/ \
        web/templates/base.html web/templates/error.html web/templates/robots.txt
```

**预期结果**：admin/account 几乎不用 `web/static/` 自定义资源，绝大部分依赖 `django.contrib.admin` / `allauth` 自带 static（位于各 app 包内，不在 `web/static/`）。

**预期可删**：
```
web/static/css/      # 上游 Bootstrap CSS
web/static/js/       # 上游 jQuery / DataTables
web/static/img/
web/static/webfonts/
web/static/graphic/
web/static/generated/
web/static/django_extensions/
```

**预期保留**：
```
web/static/spa/      # SPA build 产物 (Vite dist 拷过来)
web/static/admin/    # 仅当 admin 自定义资源存在；通常不存在
web/static/<grep 结果命中的少数文件>
```

### C.4 验证

- 访问 `/admin/`、`/admin/auth/user/` —— 资源加载正常
- 访问 `/accounts/login/`、`/accounts/password/reset/` —— 资源加载正常
- 手动构造 403：`curl -I http://192.168.1.6:8000/某个无权限路径` —— 模板渲染正常
- `/robots.txt` 返回 200
- 整套 e2e 重跑

---

## 8. Phase D — Python views 外科手术

### D.1 `web/analysis/views.py` 拆分

**保留（移到 `web/analysis/views_binary.py`，可选；或保留原文件只删 HTML 函数）**：
```python
def file(...)                    # /file/<category>/<task_id>/<dlfile>/
def vtupload(...)                # /vtupload/<category>/<task_id>/<filename>/<dlfile>/
def filereport(...)              # /filereport/<task_id>/<category>/
def full_memory_dump_file(...)   # /full_memory/<n>/
def full_memory_dump_strings(...)# /full_memory_strings/<n>/
def statistics_data(...)         # /statistics/<days>/
```

**删除**：
```
def index(...), def pending(...), def search(...), def report(...),
def comments_add(...), def load_files(...),
所有上游 lazy-load 内部 view（payloads, dropped, behavior_load, ...）
```

### D.2 `web/{submission,compare,audit,dashboard}/views.py` 全部删除

整个 app 目录可整体删除：
```
web/submission/      # 整目录删
web/compare/         # 整目录删
web/audit/           # 整目录删（注意区分：保留 web/audit_log/ phase 1 模块）
web/dashboard/       # 整目录删
```

### D.3 `web/web/settings.py` `INSTALLED_APPS` 同步清理

```python
INSTALLED_APPS = [
    ...
    # 删除：
    "submission",
    "compare",
    "audit",
    "dashboard",
    # 保留：
    "analysis",       # 二进制下载 view 仍依赖
    "audit_log",      # phase 1 audit
    "apiv2",
    "apiv3",
    ...
]
```

### D.4 `web/apiv2/views.py:203` API docs 落地页处置

```python
def index(request):
    return render(request, "apiv2/index.html", {"title": "API", "config": parsed})
```

**处置**：作为单一原子改动一并完成 ——
1. 删除 `web/apiv2/views.py` 中的 `index` view 函数
2. 删除 `web/apiv2/urls.py` 中对应的 `path("", views.index, ...)` URL 路由
3. 删除 `web/templates/apiv2/index.html`（C 阶段刻意保留至此，避免 C/D 之间的 `TemplateDoesNotExist` 窗口）

apiv3 的 `/api/v3/docs/` (drf-spectacular) 已是更好替代。**所有 token-based 的 `/apiv2/tasks/...` / `/apiv2/files/...` JSON endpoint 不动**。

### D.5 验证

- `ruff check .` 无 import 错误
- `pytest tests/` 全套通过（更新 / 删除依赖了被删 views 的测试）
- Token API 手动验证：
  - `curl -H "Authorization: Token <key>" http://192.168.1.6:8000/apiv2/tasks/list/`
  - `curl -F file=@... -H "Authorization: Token <key>" http://192.168.1.6:8000/apiv2/tasks/create/file/`
- e2e 全套
- `mypy` (agent scope) 通过

---

## 9. 验证矩阵

每阶段必须跑完才能进入下一阶段：

| 检查项 | A | B | C | D |
|---|---|---|---|---|
| `npm run typecheck && build` | ✓ | — | — | — |
| `pytest tests/` | — | ✓ | ✓ | ✓ |
| `ruff check .` | — | ✓ | ✓ | ✓ |
| 192.168.1.6 部署 | ✓ | ✓ | ✓ | ✓ |
| Playwright e2e (audit-log + recent + pending + search + submit + tasks/<id> + compare + statistics) | ✓ | ✓ | ✓ | ✓ |
| 手动 admin/login/403/robots.txt | — | — | ✓ | ✓ |
| 手动 apiv2 token API | — | — | — | ✓ |

---

## 10. 风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| apiv3 形状不完整 | 中 | A 删 fallback 后 SPA 缺数据 | A.0 形状 diff 审计 + BE 修复（gate） |
| admin/account 模板隐式 `{% include 'header.html' %}` | 低 | C 删 header 后 admin 渲染失败 | C 启动前 `grep "include 'header"` |
| `web/static/` 中某 admin 自定义资源被遗漏 | 低 | admin 资源 404 | C 启动前 `grep "{% static '"` |
| `web/analysis/views.py` 删函数后 module-level 副作用消失 | 低 | 信号未注册 / 未捕获 | D 启动前看 module top 是否有 `signals.connect` 等 |
| `web/apiv2/views.py:index` 被外部测试用例引用 | 低 | pytest 失败 | D 同步删除/更新对应测试 |

回滚单元 = 单阶段。每阶段独立 commit (`refactor(spa-cleanup): phase A — drop scrape fallback` 等)；问题严重时 `git revert <phase commit range>` 即可恢复。

---

## 11. 范围之外 (Out of Scope)

明确不做：

- 鉴权模型变更（保持 session cookie，不切 token / JWT）
- FastAPI 边车
- Audit log Phase 2（task lifecycle / 配置文件审计）—— 已在 audit-log spec 内 deferred
- apiv2 endpoint 行为变更（仅删 docs landing page，不动业务 endpoint）
- SPA 视觉 / 交互改动（refresh apart from `useAnalysisScrape` 整体替换 —— 这个是已经被 useTasks 替代的死代码）
- 引入 new dependency（除非 apiv3 形状修复期间需要）

---

## 12. 推进顺序总览

```
  ┌──────────────┐
  │ A.0 形状审计  │  → audit doc + BE 修复（如需）
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ A.1 改 hook   │  → A.2 删 scrape → A.3 验证 → commit
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ B URL 收口    │  → 验证 → commit
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ C 模板/静态   │  → 验证 → commit
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ D Python 拆分 │  → 验证 → commit
  └──────────────┘
         │
  ┌──────▼───────┐
  │ 全套 e2e 收尾 │  → 推送
  └──────────────┘
```

**预计文件数变化**：删除 ~250+ 文件、~6 MB。`web/templates/` 从 1.2 MB → ~80 KB（仅留 admin/account/socialaccount/error/base/robots）。`web/static/` 从 4 MB → 仅留 `spa/`（Vite build 产物，Phase A 之后约 1 MB）。
