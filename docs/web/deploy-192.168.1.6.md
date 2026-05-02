# 192.168.1.6 SPA 部署记录

> 把 `refactor/web-spa` 分支的 React SPA 部署到 `192.168.1.6:8000`，替换上游 Bootstrap 前端。后端 (apiv2 / 调度器 / Mongo / Postgres / VM machinery) 保持不变。

## 部署环境

| 项 | 值 |
|---|---|
| 主机 | `192.168.1.6` |
| 登录 | `ubuntu / ubuntu` (SSH, sudo NOPASSWD) |
| CAPE 安装路径 | `/opt/CAPEv2/` (上游 fork, owner `cape:cape`) |
| Web service | `cape-web.service` (`runserver_plus 0.0.0.0:8000`, User `cape`) |
| Python 环境 | `/opt/CAPEv2/.venv/` (poetry, Python 3.12) |
| 反向代理 | 无 — Django 直接监听 `:8000` |
| Node.js | 远端无；SPA 在本机 build 后 rsync `dist/` 上去 |

## 部署变更

| 改的东西 | 内容 |
|---|---|
| `web/apiv3/*` | **整个 app 新加** — drf-spectacular OpenAPI、SSE、12 个 service helpers |
| `web/services/*` | service 层（report / task / submission / search / statistics / compare / machine / event）|
| `web/static/spa/` | **新加** Vite build 产物 (`dist/` rsync 进来) |
| `web/static/css/cape-auth.css` | 新登录/注册皮肤 |
| `web/templates/account/*` | 新 auth 模板 (allauth) |
| `web/templates/submission/index.html` | 给 SPA scrape 用的字段对齐 |
| `web/web/settings.py` | `INSTALLED_APPS += ['drf_spectacular', 'apiv3']`；DRF schema class；SPECTACULAR_SETTINGS dict |
| `web/web/urls.py` | 加 `/api/v3/` 挂载 + SPA catchall + 旧 Bootstrap include 后置（保 reverse url 名）|
| `web/web/spa_view.py` | **新加** — Django 视图返回 `web/static/spa/index.html` |
| Python deps | `drf-spectacular>=0.27.2` 装到 cape 的 poetry venv |

### URL 路由表（部署后）

```
/                               → SPA (name=dashboard)        [新]
/recent /pending /search /stats /tasks/* /machines /configs /login /submit/* /compare/*
                                → SPA catchall                [新]
/api/v3/                        → DRF apiv3                   [新]
/api/v3/docs/  /api/v3/schema/  → drf-spectacular Swagger     [新]

/apiv2/                         → Token-auth REST API         [保留]
/admin/  /accounts/             → Django admin / allauth      [保留]
/static/                        → Django static               [保留]
/analysis/                      → Bootstrap (lazy load_files) [保留]
/audit/  /dashboard/            → Bootstrap                   [保留]
/file/* /vtupload/* /filereport/* /full_memory/*  /statistics/<n>/
                                → 任务工件下载                [保留]
/robots.txt                     → 静态                        [保留]
/submit/  /compare/             → Django (仅供 reverse 解析)  [保留]
```

旧 `submit/` `compare/` include 后置保留——SPA catchall 在前面已经匹配，浏览器永远走 SPA；include 只为 `{% url 'submission' %}` 模板反向 URL 解析服务。

### 端点验收

```
GET /                          200  (SPA index.html)
GET /api/v3/system/info/       403  (auth required, expected)
GET /api/v3/auth/csrf/         200
GET /api/v3/docs/              200  (Swagger UI)
GET /api/v3/schema/            200  (OpenAPI JSON)
GET /apiv2/                    200
GET /static/spa/index.html     200  (576 bytes)
GET /static/spa/assets/index-*.js   200  (431 KB)
GET /static/spa/assets/index-*.css  200  (41 KB)
GET /tasks/3                   200  (SPA → SPA index, client-side route)
GET /analysis/2/               200  (Bootstrap, kept)
GET /submit/                   200  (Bootstrap; SPA catchall shadows it for browser reads — see urls.py)
GET /compare/2/                200
GET /robots.txt                200
GET /admin/login/              500  (PRE-EXISTING — unapplied django_site migrations, not introduced by this deploy)
GET /accounts/login/           500  (同上)
```

## 部署流程（已执行）

```bash
# 本机
cd /Users/lamba/github/cape/frontend/app && npx vite build
# stage tarball at /tmp/cape-deploy/web/{apiv3,services,static,templates,web}

# 远端
sudo tar -czf /opt/CAPEv2/web.bak.20260501-152918.tar.gz -C /opt/CAPEv2 web
# rsync 部署 (注意：用 -az --delete-excluded 会删 manage.py 等不在 payload 里的文件，
# 已用 `tar -xzf web.bak --skip-old-files` 恢复缺失文件)
sshpass -p ubuntu rsync -az /tmp/cape-deploy/web/ ubuntu@192.168.1.6:/opt/CAPEv2/web/
sudo chown -R cape:cape /opt/CAPEv2/web
sudo -u cape /etc/poetry/bin/poetry add drf-spectacular --quiet
sudo systemctl restart cape-web
```

### 部署后修了 2 个真错（forward-reference + 模板 reverse）

1. `apiv3/serializers.py` 第 73 行 `CompareCandidatesResponseSerializer` 引用第 198 行才定义的 `TaskSummarySerializer` — Python 类体在 module load 时立即执行，导致 `NameError` 启动失败。把 `TaskSummarySerializer` 上移到 `CompareCandidatesResponseSerializer` 之前。
2. `web/web/urls.py` SPA 化后丢了 `name="dashboard"` / `name="submission"` / `name="compare_*"` URL 名，上游模板 `{% url 'dashboard' %}` 等抛 `NoReverseMatch`。把 root SPA 视图改名 `dashboard`，并把 `submit/` `compare/` Django include 重新挂载在 SPA catchall 之后（仅用作 reverse 解析，不接收 GET）。

## 回滚 SOP

```bash
# 直接回滚 web/ 整个目录
ssh ubuntu@192.168.1.6
sudo systemctl stop cape-web
sudo rm -rf /opt/CAPEv2/web
sudo tar -xzf /opt/CAPEv2/web.bak.20260501-152918.tar.gz -C /opt/CAPEv2
sudo chown -R cape:cape /opt/CAPEv2/web
# 反向操作可选：drf-spectacular 卸载（不必，留着无副作用）
# sudo -u cape /etc/poetry/bin/poetry remove drf-spectacular
sudo systemctl restart cape-web
```

回滚后 5 秒内服务恢复到上游 Bootstrap UI 状态。备份 tar.gz 大小 2.3MB，已留在 `/opt/CAPEv2/web.bak.20260501-152918.tar.gz`。

## 已知遗留

- `admin/login/` `accounts/login/` 返回 500 — 上游部署 sqlite `django_site` 表没跑过 `manage.py migrate`，部署前后都是这个状态。修复：`sudo -u cape /etc/poetry/bin/poetry run python /opt/CAPEv2/web/manage.py migrate`。
- `OPTIONAL! Missed dependency: httpreplay` — 上游也是 missing，与 SPA 无关。
- `runserver_plus` 是 Django dev server，**不是生产 WSGI server**。systemd 单元里写死的 `manage.py runserver_plus 0.0.0.0:8000`。生产建议换 daphne / gunicorn + uvicorn-worker。

## 后续可做

- 修 `manage.py migrate` 让 admin/allauth 登录可用
- 把 `cape-web.service` 切到 daphne (SSE `/api/v3/events/tasks` 需要 ASGI)
- 把 `192.168.1.6` 加进 `frontend/app/playwright.config.mjs` 的 `PARITY_*` 环境变量直接跑 e2e

---

## 2026-05-01 增量：apiv2 → apiv3 整合（保留 apiv2）

按用户指示「不改变原有的 apiv2 相关的后端接口，后续所有后端接口功能都在 apiv3 上进行修改，并对将之前的接口都先都转移到 apiv3 上（保留 apiv2 接口）」做完整合：

### 实现

`web/apiv3/legacy_views.py`（新增）：31 个 thin delegation wrapper，每个就是 `return v2.<fn>(request._request, ...)`。共享 apiv2 全部业务逻辑，0 行代码复制。

`web/apiv3/urls.py` 加 31 条 `/api/v3/legacy/...` 路由 + 多个变体（如 `/tasks/get/report/<id>/[<fmt>/[<zip>/]]` 多个 path matcher）。

### 192.168.1.6 实测联调

| 维度 | 结果 |
|---|---|
| 端点状态码一致性 | **16/16 OK** （v2 和 v3-legacy 同步骤返回相同 HTTP code） |
| Body 字节级一致 | **6/7** identical（包括 1.2MB IOCs JSON 这种大对象） |
| zip 类端点 | byte-not-identical 但解压后内容相等（zip 元数据时间戳每次不同，连续调 v2 自己也不一致） |
| 匿名访问 | 都 401（`IsAuthenticated`）|
| OpenAPI schema | drf-spectacular 自动列出 41 个 `/legacy/` paths，Swagger UI 可直接试 |

### 调用方迁移路径

老脚本（继续可用，0 中断）：
```bash
curl -H "Authorization: Token <key>" http://192.168.1.6:8000/apiv2/tasks/get/report/3/json/
```

新脚本（推荐）：
```bash
curl -H "Authorization: Token <key>" http://192.168.1.6:8000/api/v3/legacy/tasks/get/report/3/json/
```

未来要修改某条 legacy 端点的行为时，**只在 apiv3/legacy_views.py 修改**，apiv2/views.py 保持冻结。如果需要更深度重构，把 thin wrapper 升级成独立实现即可。

## 2026-05-02 增量：audit_log phase 1 部署

按 `docs/superpowers/specs/2026-05-01-audit-log-design.md` + `docs/superpowers/plans/2026-05-01-audit-log.md` 部署:

- 新 Django app `audit_log/` 落地 + 0001_initial migration applied (siteauth.sqlite)
- `cape-audit-prune.timer` 安装并 `enable --now` (每日 03:00 prune > 90 天事件)
- 重启 cape-web 让 allauth + LogEntry 信号 receivers 注册
- SPA `/audit` 路由前置在 Django audit/ 测试套件 include 之前

实测端点:
  GET /api/v3/audits/?limit=5    → 200, 含 admin login_success 行
  GET /api/v3/audits/?action=login_failed → 200, 含 attempted_username=admin
  GET /api/v3/audits/?actor=admin → 200, 单行筛选准确
  GET /api/v3/audits/actions/    → 200, 12 个 action 全列出

Playwright e2e (tests/e2e/audit-log.spec.mjs):
  ✓ anonymous /audit redirects to login
  ✓ admin /audit shows table + filter + login_success row (5 rows, 1 login_failed)
  ✓ filter ?action=login_failed narrows result
  3/3 PASS.

凭证不变, /audit 页面只对 is_staff 可见.

## 2026-05-02 增量：FE/BE 完全分离清理 (Phase A → D)

按 `docs/superpowers/specs/2026-05-02-fe-be-separation-cleanup-design.md` + `docs/superpowers/plans/2026-05-02-fe-be-separation-cleanup.md` 落地。

**整体效果**：30 commits / 227 files / **-23,464 lines** 净删除。SPA 现在仅通过 `/api/v3/*` 与后端通信，零 HTML scrape fallback。Token 鉴权流程不变（apiv2 + apiv3 共享 DRF Token / API key）。

### Phase A — Frontend scrape fallback 移除
- 8 个 hook + 7 个 `upstream-*-scrape.ts` 模块 + `useAnalysisScrape.ts` 整体删除
- A0 形状审计 (`docs/superpowers/audits/2026-05-02-apiv3-shape-diff.md`) 验证 0 BE gap
- 一并修复 plan 漏掉的 `useFeatureFlags.ts` + `useTaskList.ts`，以及 `AuditFilters` 类型 drift
- 新增 `phase-a-network-probe.spec.mjs` Playwright 测试，永久 lock-in 0 `/_upstream/*` 调用

### Phase B — Django URL 收口
- 删除 `web/web/urls.py` 中 8 个 `_upstream/*` shim
- 删除 `include(analysis|submission|compare|audit)` 4 行
- 修复 2 个测试（`/submit/` 不再 render Bootstrap HTML）

### Phase C — Templates + static cleanup
- 删除 6 个上游 template dirs（analysis/submission/compare/audit/dashboard/auth）+ 7 个 standalone partials
- 删除 `frontend/web-design/`（前端设计稿已废弃）
- web/static/ 从 48 文件精简到 3（仅保留 admin/account 实际引用的 `img/cape.png`、`css/cape-auth.css`、`css/fontawesome-all.css`）
- base.html 内联 header/footer 后删除 partial（option 2 strategy）

### Phase D — Python views 外科手术
- D1 audit 发现 `web/services/submission_service.py` 的 lazy `from submission.views import get_form_data` 在 D3 删 web/submission/ 后会让 SPA submit 表单的 PACKAGE/MACHINE 下拉静默变空。
- **Pre-D3 fix（commit `b7eb648e`）**：把 `parse_expr/parse_ast/get_lib_common_constants/get_package_info/get_enabled_platforms/correlate_platform_packages/get_form_data` 全部 port 进 `submission_service.py` 作为 `_load_packages_and_machines(web_conf, db)`。submission_service 现在 self-contained。同时清掉 `analysis/forms.py` 死 import（已埋伏的 bug）。
- D2: `web/analysis/views.py` 从 3236 行精简到 520 行，仅保留 6 个 binary entry (`file/vtupload/filereport/full_memory_dump_file/full_memory_dump_strings/statistics_data`) + transitive helpers + module globals（`integrations_cfg/web_cfg/reporting_cfg/USE_SEVENZIP/SEVENZIP_PATH/enabledconf/anon_not_viewable_func_list/zip_categories/category_map`）+ `conditional_login_required` decorator 类。
- D3-D6: 整删 4 个 legacy Django apps (`web/{submission,compare,audit,dashboard}/`)。注意 `web/audit/` ≠ `web/audit_log/` —— 后者保留。
- D7: `INSTALLED_APPS` 仅删 `compare`（其余 3 个本就没注册）。
- D8: 删 apiv2 docs landing page（view + URL + template 原子提交），不动 token API endpoints。

### 实测验证 (D9)
```
admin/login/, accounts/login/, robots.txt          → 200
api/v3/me/, api/v3/system/info/                    → 401 (alive)
apiv2/                                              → 404 (docs 落地页已删)
apiv2/cuckoo/status/, tasks/list/, machines/list/  → 200 with valid JSON (token API alive)
file/, full_memory/, statistics/                   → 302 (login 重定向，binary endpoints alive)
_upstream/submit/, /analysis/                      → 404 (Phase B 删除)
SPA catchall (/, /audit, /submit, /recent)          → 302 (login 重定向)
```

Playwright e2e:
```
audit-log.spec.mjs               3/3 PASS (32 audit events)
phase-a-network-probe.spec.mjs   1/1 PASS (0 _upstream hits across 9 routes)
```

remote pytest (`/opt/CAPEv2/.venv/bin/python -m pytest`):
```
Results: 354 passed / 5 failed (4 apiv2 reprocess pre-existing token issue, 1 mitre 网络依赖) / 36 skipped
```

凭证不变（admin / cape123!）。

## 2026-05-02 (later) — User management self-service

按 `docs/superpowers/specs/2026-05-02-user-management-design.md` + `docs/superpowers/plans/2026-05-02-user-management.md` 部署。

### 后端
- 新 apiv3 endpoint：`PATCH /api/v3/me/`、`POST /api/v3/me/password/`
- `MeUpdateSerializer` 显式拒绝 `username/is_staff/is_superuser/is_active/password` 等非自助字段
- `ChangePasswordSerializer` 三重校验：current 哈希 + new == confirm + Django `AUTH_PASSWORD_VALIDATORS`
- 新 audit ACTION：`profile_update`（auth 类目）—— PATCH /me/ 内显式 `audit.log()` 调用
- 已知 deviation：`AUTH_PASSWORD_VALIDATORS` 在 prod settings 是空的（生产建议跟进）；A5 view 内手动 `password_changed.send()` 因为 allauth 的 signal 只在它自己的 HTML flow 里 fire

### 前端
- 新 `Dialog` primitive (radix wrapper, 115 LOC) + 新 `Toast` system (107 LOC, 自实现无依赖)
- 新 `me.ts` API client (updateMe + changePassword)
- Topbar 头像下拉：`<a href="/accounts/password/change/">` → 两个 modal-driven menuitem (`Edit profile` + `Change password`)
- Sidebar Admin 区加 `Users` 链接（外链到 `/admin/auth/user/`，is_staff 可见）；Audit 也加上 `staffOnly` gate
- `useCurrentUser` cache 在 profile 改完后通过 `qc.setQueryData` 立即刷新 → topbar 头像/姓名同步更新
- UX fix：菜单项 `onSelect` 去掉 `e.preventDefault()` 让 radix 自动关闭 dropdown（避免 modal 关后下拉卡 open 状态）

### 实测
```
Pytest (远端 cape venv): 26/26 passed (5 新文件，audit_log + apiv3 me/password)

Playwright (192.168.1.6):
  audit-log.spec.mjs            3/3 PASS
  phase-a-network-probe.spec.mjs 1/1 PASS
  recent-detail-display.spec.mjs 2/2 PASS
  docs-page.spec.mjs             1/1 PASS
  account-self-service.spec.mjs  4/4 PASS  (含完整改密 round-trip)
  smoke.spec.mjs                 7/7 PASS  (单独跑避免 pool 耗尽)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total                         18/18 PASS
```

### 影响
凭证不变 (admin / cape123!)；apiv2 token API 不变；Django admin /admin/auth/user/ 入口现在从 SPA 侧栏可达；个人 profile / 密码修改完全在 SPA 内闭环，不再跳出到 allauth 页面。
