# CAPEv2 Web 接口参考

> 范围：`web/` 目录下所有可被外部 / 浏览器调用的 HTTP 端点（不含 `agent/`、不含 `lib/cuckoo/core/resultserver.py` 等内部 Result Server）。
>
> 来源：基于 `web/web/urls.py` 入口往下抓出的全部子路由（`apiv2 / apiv3 / analysis / submission / dashboard / compare / audit / guac` 等八个 Django app + 全局根路由）。每条路由都注明 HTTP method、认证要求、`api.conf` 配置开关、速率限制、参数与响应外形。
>
> 上游参考：`https://github.com/kevoreilly/CAPEv2/tree/master/web`。本仓库基于上游 `kevoreilly/master` fork，并新增 `apiv3/` SPA 后端。

---

## 0. 顶层结构

```
/                         → dashboard.views.index           (HTML)
/dashboard/               → dashboard 视图                  (HTML)
/admin/                   → Django admin                    (HTML)
/accounts/                → django-allauth (login/logout/signup/2FA) (HTML)
/robots.txt               → static                          (text)

/analysis/...             → 分析列表 / 详情 / 子 tab        (HTML + 内嵌 fragment)
/submit/...               → 提交向导                        (HTML + form)
/compare/...              → 任务对比                        (HTML)
/audit/...                → 自检 / 测试套件                 (HTML)
/guac/...                 → Guacamole 远程会话              (HTML)

/apiv2/...                → Token-auth REST API (DRF)       ← 程序化访问
/api/v3/...               → SPA REST API (DRF + Spectacular) ← Bootstrap → React 重构层

/file/<cat>/<id>/<dl>/    → 单文件下载（任务工件）          (binary)
/vtupload/<cat>/<id>/...  → 上传到 VirusTotal                (HTML / redirect)
/filereport/<id>/<cat>/   → 直链下载 JSON/HTML/PDF report    (binary)
/full_memory/<id>/        → 完整内存 dump 下载              (binary)
/full_memory_strings/<id>/→ 内存 strings 下载                (text)
/statistics/<days>/       → 统计页面（HTML）                (HTML)
```

按"调用方"分三大类：

| 分类 | 鉴权机制 | 调用方 | 节流 |
|---|---|---|---|
| **Token-auth REST**（`/apiv2/`） | DRF `Token` (Header `Authorization: Token <key>`) 或会话 | 外部脚本、CI、IR 工具链、`utils/submit.py` | `api.conf` 中每端点 `rps` / `rpm` 双限 |
| **Frontend REST**（`/api/v3/`） | Django session cookie + CSRF | SPA / `frontend/app` | DRF 默认全局 throttle（settings 中调） |
| **Frontend HTML**（其余路由） | Django session cookie，多数走 `@conditional_login_required` | 浏览器、`/_upstream/` 回退 scrape | 通常不限速；上传类有 LIMITER |

---

## 1. Token-auth REST API（`/apiv2/`）

**统一约束**

- 路径前缀：`/apiv2/`。
- 鉴权：当 `[api] token_auth_enabled = yes` 时强制 token；否则 token 与会话二选一。Token 通过 `POST /apiv2/api-token-auth/` 申请（DRF `obtain_auth_token`）。
- 鉴权 header：`Authorization: Token <40 字符 hex>`。也支持 Django session（已登录浏览器直接调用）。
- 响应外形（统一信封）：`{"error": bool, "data"|"error_value": ..., ...}`。
- 速率限制：`api.conf` 中每个端点 `rps`（per-second）+ `rpm`（per-minute）；同时受 `[api] default_user_ratelimit / default_subscription_ratelimit` 全局兜底。
- 端点开关：`api.conf` 各 section 的 `enabled = yes/no` 控制是否暴露；`auth_only = yes` 表示该端点强制要求登录态。
- `mcp = yes` 子项保留给 MCP server 集成，不影响 HTTP 入口。
- CSRF：`@csrf_exempt`（外部脚本无 cookie，不能强求 CSRF）。

### 1.1 鉴权 / 元数据

| Method | Path | 描述 | 配置开关 | 限速 |
|---|---|---|---|---|
| GET | `/apiv2/` | API 元数据：每个端点的开关 + rps/rpm + url 帮助 | `[api]` | n/a |
| POST | `/apiv2/api-token-auth/` | 用 username/password 换 token | 永远启用 | 不限速；登录失败由 Django 框架计费 |
| GET | `/apiv2/cuckoo/status/` | 沙箱版本 + 任务/机器队列概况 | `[cuckoostatus]` | rps/rpm |
| GET | `/apiv2/exitnodes/` | 列出 routing.conf 中的 `exit_nodes` | `[list_exitnodes]` | rps/rpm |
| GET | `/apiv2/machines/list/` | 全部分析 VM | `[machinelist]` | rps/rpm |
| GET | `/apiv2/machines/view/<name>/` | 单机详情 | `[machineview]` | rps/rpm |
| GET | `/apiv2/tasks/statistics/<days>/` | 最近 N 天任务统计 | `[statistics]` | rps/rpm |
| GET | `/apiv2/tasks/get/latests/<hours>/` | 最近 N 小时任务 ID 列表 | `[tasks_latest]` | rps/rpm |
| GET | `/apiv2/tasks/stats/` | 24h 滚动统计 | `[task_x_hours]` | rps/rpm |

### 1.2 提交（创建任务）

请求体：`multipart/form-data`，字段 `file=<上传文件>` 或 `url=<...>` 等；通用可选字段：`package, timeout, priority, options, machine, platform, tags, custom, memory, enforce_timeout, clock, route, route_block_dns, unique`。

| Method | Path | 描述 | 配置开关 | 关键限制 |
|---|---|---|---|---|
| POST | `/apiv2/tasks/create/file/` | 上传单/多文件 | `[filecreate]` | `multifile=no` 时只取第一个；`allmachines=no` 时禁用 `machine=all`；`status=yes` 返回 callback URL |
| POST | `/apiv2/tasks/create/url/` | URL 任务 | `[urlcreate]` | 同上 |
| POST | `/apiv2/tasks/create/dlnexec/` | 下载并执行 URL | `[dlnexeccreate]` | 需 `[dlnexeccreate].enabled=yes` |
| POST | `/apiv2/tasks/create/download_services/` | 从 VT/MWDB/Bazaar 等 hash 拉取后再提交 | `[downloading_services]` | service + hash 必填 |
| POST | `/apiv2/tasks/create/static/` | 仅静态分析（不进 VM） | `[staticextraction]` | rps `5/s` |
| POST | `/apiv2/tasks/delete_many/` | 批量删除 task_ids | `[taskdelete]` | body `task_ids=[...]` |

提交响应（典型）：

```json
{
  "error": false,
  "data": {
    "task_ids": [1234],
    "url": ["http://host/submit/status/1234/"],   // 当 status=yes
    "file_id": [42]                                // 当 multifile + 文件入库成功
  },
  "errors": []
}
```

### 1.3 任务查询 / 操作

| Method | Path | 描述 | 配置开关 |
|---|---|---|---|
| GET | `/apiv2/tasks/search/md5/<32 hex>/` | hash 搜索 task_ids | `[tasksearch]` |
| GET | `/apiv2/tasks/search/sha1/<40 hex>/` | 同上 | `[tasksearch]` |
| GET | `/apiv2/tasks/search/sha256/<64 hex>/` | 同上 | `[tasksearch]` |
| POST | `/apiv2/tasks/extendedsearch/` | 跨 SQL+Mongo 多前缀搜索 | `[extendedtasksearch]` |
| GET | `/apiv2/tasks/list/[/<limit>[/<offset>[/<window>]]]/` | 任务列表（DESC by id） | `[tasklist]` |
| GET | `/apiv2/tasks/view/<id>/` | 单任务摘要（不含报告） | `[taskview]` |
| GET | `/apiv2/tasks/status/<id>/` | 任务状态轮询 | `[taskstatus]` |
| GET | `/apiv2/tasks/reschedule/<id>/` | 重新入队 | `[taskresched]` |
| GET | `/apiv2/tasks/reprocess/<id>/` | 重跑 processing/signatures/reporting | `[taskreprocess]` |
| GET | `/apiv2/tasks/delete/<id>/[<status>/]` | 删除（可选 status 过滤） | `[taskdelete]` |

### 1.4 报告 / IOC / Config

| Method | Path | 描述 | 配置开关 | 备注 |
|---|---|---|---|---|
| GET | `/apiv2/tasks/get/report/<id>/[<format>/[<make_zip>]]` | 获取报告 | `[taskreport]` | format ∈ `{json, html, all, pdf, ...}`；`all` 可能受 `enabled` 控制；返回 200 + body 或 zip |
| GET | `/apiv2/tasks/get/iocs/<id>/[detailed/]` | 提取 IOCs | `[taskiocs]` | detailed=有则返回完整对象 |
| GET | `/apiv2/tasks/get/config/<id>/[<cape_name>/]` | 提取 malware config | `[capeconfig]` | `cape_name` 限定家族 |
| GET | `/apiv2/tasks/get/screenshot/<id>/[<n 1-4 digits>/]` | 截图（zip 或单张 PNG） | `[taskscreenshot]` |
| GET | `/apiv2/tasks/get/pcap/<id>/` | 网络 PCAP | `[taskpcap]` |
| GET | `/apiv2/tasks/get/tlspcap/<id>/` | 解密的 TLS PCAP | `[tasktlspcap]` |
| GET | `/apiv2/tasks/get/evtx/<id>/` | Windows EVTX log | `[taskevtx]` |
| GET | `/apiv2/tasks/get/dropped/<id>/` | dropped files zip | `[taskdropped]` |
| GET | `/apiv2/tasks/get/selfextracted/<id>/[<tool>/]` | self-extract 产物 | `[taskselfextracted]` |
| GET | `/apiv2/tasks/get/surifile/<id>/` | Suricata files zip | `[tasksurifile]` |
| GET | `/apiv2/tasks/get/mitmdump/<id>/` | mitmproxy HAR | `[mitmdump]` |
| GET | `/apiv2/tasks/get/payloadfiles/<id>/` | CAPE payloads zip | `[payloadfiles]` |
| GET | `/apiv2/tasks/get/procdumpfiles/<id>/` | procdump 产物 | `[procdumpfiles]` |
| GET | `/apiv2/tasks/get/procmemory/<id>/[<pid>/]` | 进程内存 dump（all/pid） | `[taskprocmemory]` |
| GET | `/apiv2/tasks/get/fullmemory/<id>/` | VM 完整内存 | `[taskfullmemory]` |
| POST | `/apiv2/tasks/get/stream/<id>/` | 流式状态 + 报告（长连接） | `[taskstatus]` |

### 1.5 文件库

| Method | Path | 描述 | 配置开关 |
|---|---|---|---|
| GET | `/apiv2/files/view/md5/<hash>/` | sample 表查询 | `[fileview].md5` |
| GET | `/apiv2/files/view/sha1/<hash>/` | 同上 | `[fileview].sha1` |
| GET | `/apiv2/files/view/sha256/<hash>/` | 同上 | `[fileview].sha256` |
| GET | `/apiv2/files/view/id/<sample_id>/` | 同上 | `[fileview].id` |
| GET | `/apiv2/files/get/md5/<hash>/` | sample 二进制下载 | `[sampledl]` |
| GET | `/apiv2/files/get/sha1/<hash>/` | 同上 | `[sampledl]` |
| GET | `/apiv2/files/get/sha256/<hash>/` | 同上 | `[sampledl]` |
| GET | `/apiv2/files/get/task/<id>/` | 同上（按 task） | `[sampledl]` |

### 1.6 已注释 / 实验性（暂未挂载）

```
# tasks/add/<category>/<task_id>/   → views.post_processing
# dist/tasks_reported               → 分布式上报
# dist/tasks_notification/<id>      → 分布式通知
```

存在于 `apiv2/views.py`，但 `urls.py` 中 commented out — 当前不可用。

### 1.7 错误外形

成功：

```json
{ "error": false, "data": ... }
```

失败：

```json
{ "error": true, "error_value": "<人话错误信息>" }   // HTTP 200 居多，部分关键端点返回 4xx
```

429（速率超限）：HTTP 429，body 由 `views.limit_exceeded` 决定（JSON `{ "error": true, "error_value": "..." }`）。

---

## 2. Frontend REST API（`/api/v3/`）

**统一约束**

- 路径前缀：`/api/v3/`。
- 鉴权：Django session cookie（DRF `IsAuthenticated`）；唯一例外 `auth/csrf/` 是 `AllowAny` 用于 SPA 启动时种 CSRF cookie。
- CSRF：所有 `POST/DELETE` 必须带 `X-CSRFToken` header（值取自 `csrftoken` cookie）。
- 响应外形：DRF 标准。错误体走 `_error()` helper：

  ```json
  { "code": "<machine-readable>", "message": "<human>", ...details }
  ```

  HTTP code 与 code 语义一致（404 / 400 / 403 / 409）。
- OpenAPI：drf-spectacular 自动生成；schema URL `/api/v3/schema/`，Swagger UI `/api/v3/docs/`。
- 限速：DRF 全局 throttle（默认 `settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`）。无 per-endpoint 配置开关 — 由 SPA 调用，按 session 已计入用户额度。

### 2.1 认证与元数据

| Method | Path | 描述 | 鉴权 |
|---|---|---|---|
| GET | `/api/v3/auth/csrf/` | 种 `csrftoken` cookie，并把值回写到 body | AllowAny |
| GET | `/api/v3/me/` | 当前用户 + 报告下载权限 | IsAuthenticated |
| GET | `/api/v3/system/info/` | sandbox 版本 / commit / 构建标识 | IsAuthenticated |
| GET | `/api/v3/system/feature-flags/` | `api.conf [<endpoint>].enabled` 镜像，给 SPA 用 | IsAuthenticated |
| GET | `/api/v3/system/submission-form/` | 提交表单选项（packages / machines / routes / tags / 配置门控） | IsAuthenticated |

### 2.2 搜索 / 统计 / 对比

| Method | Path | 描述 |
|---|---|---|
| GET | `/api/v3/search/?q=<query>` | 跨 store 扩展搜索（镜像 `/analysis/search/`） |
| GET | `/api/v3/search/prefixes/` | 可用前缀 + 分类 + 描述 |
| GET | `/api/v3/statistics/<days:int>/` | 最近 N 天统计（镜像 `/statistics/<days>/`） |
| GET | `/api/v3/compare/<left:int>/` | 同 md5 对比候选 |
| GET | `/api/v3/compare/<left:int>/<right:int>/` | 双任务行为差异 + 总结交集 |

### 2.3 任务

| Method | Path | 描述 |
|---|---|---|
| GET | `/api/v3/tasks/?cursor=<id>&limit=<n>` | 任务列表（cursor 分页，DESC by id） |
| GET | `/api/v3/tasks/<id:int>/` | 单任务摘要（TaskSummary） |
| DELETE | `/api/v3/tasks/<id:int>/delete/` | 删除任务 + on-disk + Mongo 数据 |
| GET | `/api/v3/tasks/<id:int>/errors/` | `cuckoo_errors` 行 |
| POST | `/api/v3/tasks/file/` | 上传文件（同 apiv2 multipart） |
| POST | `/api/v3/tasks/url/` | URL 任务 |
| POST | `/api/v3/tasks/dlnexec/` | 下载并执行 |
| POST | `/api/v3/tasks/download_services/` | 第三方服务 hash 拉取 |
| POST | `/api/v3/tasks/<id:int>/resubmit/<file_hash:str>/` | 按 sha256/sha1/md5 重提交磁盘上 sample |

### 2.4 报告（9 tab）

每个端点对应 SPA Task Detail 上的一个 tab；返回的形状由 `apiv3.serializers` 模块声明 — `frontend/app/src/lib/api/reports.ts` 中有镜像类型。

| Method | Path | 描述 | 形状（关键字段） |
|---|---|---|---|
| GET | `/api/v3/reports/<id>/summary/` | 报告头 + tab counts + Findings 栏 | `task / available_sections / tab_counts / signatures / score / severity / verdict / family / behavior_summary / analysis_info / machine_info / file_info / pe_info / statistics_processing / subfiles / yara_matches / virustotal` |
| GET | `/api/v3/reports/<id>/behavior/` | 行为概要 | `platform / processtree / processes` |
| GET | `/api/v3/reports/<id>/behavior/calls/?pid=<pid>&page=<n>` | 单进程 API call 分页 | `calls / page / total_chunks / has_next` |
| GET | `/api/v3/reports/<id>/static/` | PE / 文件元 + 解析 | `static / target_file` |
| GET | `/api/v3/reports/<id>/attack/` | MITRE ATT&CK | `ttps / mitre_attck` |
| GET | `/api/v3/reports/<id>/config/` | malware config | `malware_conf` |
| GET | `/api/v3/reports/<id>/network/` | 网络全集 | `hosts / domains / tcp / udp / icmp / smtp / irc / http / suricata` |
| GET | `/api/v3/reports/<id>/dropped/` | dropped 文件 | `dropped` |
| GET | `/api/v3/reports/<id>/payloads/` | CAPE 提取的 payload | `payloads` |
| GET | `/api/v3/reports/<id>/screenshots/` | 截图列表 | `count / shots` |

### 2.5 机器

| Method | Path | 描述 |
|---|---|---|
| GET | `/api/v3/machines/` | 全部分析 VM |
| GET | `/api/v3/machines/<name:str>/` | 单机详情 |

### 2.6 实时事件（SSE）

| Method | Path | 描述 | 约束 |
|---|---|---|---|
| GET | `/api/v3/events/tasks` | Server-Sent Events：任务状态 / 机器状态变更推送 | 仅 session auth；要 ASGI / Daphne，gunicorn-sync 不支持 |

事件 payload（`SSEEvent`）：

```ts
type SSEEvent =
  | { type: "task.created"; id: number; ... }
  | { type: "task.status"; id: number; status: TaskStatus }
  | { type: "task.report_ready"; id: number }
  | { type: "machine.status"; name: string; status: string };
```

### 2.7 OpenAPI

| Method | Path | 描述 |
|---|---|---|
| GET | `/api/v3/schema/` | OpenAPI 3.x JSON schema（drf-spectacular） |
| GET | `/api/v3/docs/` | Swagger UI |

---

## 3. 前端 HTML 路由（浏览器直访）

> 所有 HTML 路由都吃 Django session cookie；多数视图用 `@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)` 包裹 — `WEB_AUTHENTICATION=True` 时强制登录。

### 3.1 顶层 / 全局

| Path | 描述 | 备注 |
|---|---|---|
| `GET /` | Dashboard 首页 | `dashboard.views.index` |
| `GET /admin/` | Django admin | `[api] WEB_AUTHENTICATION` 之外另控 |
| `GET /accounts/login/`、`/logout/`、`/signup/`、`/2fa/`等 | django-allauth | 受 `[api] TWOFA` 控 |
| `GET /robots.txt` | 静态 | n/a |
| `GET /dashboard/` | 仪表盘 | 同首页 |
| `GET /statistics/<days>/` | N 天统计页 | `analysis_views.statistics_data` |

### 3.2 `/analysis/`

| Method | Path | 描述 |
|---|---|---|
| GET | `/analysis/` | Recent 列表（4 tab：Files / Static / URLs / PCAPs） |
| GET | `/analysis/page/<n>/` | 列表分页 |
| GET | `/analysis/<id>/` | 任务详情主页（Quick Overview / 9 tab 切换） |
| GET/POST | `/analysis/load_files/<id>/<category>/` | 懒加载某 tab 内容（fragment HTML），CSRF 保护 |
| GET | `/analysis/load_evtx_channel/<id>/` | EVTX 通道列表 |
| GET | `/analysis/load_evtx_channel_count/<id>/` | EVTX 通道计数 |
| GET | `/analysis/surialert/<id>/` | Suricata alert 子页 |
| GET | `/analysis/surihttp/<id>/` | Suricata HTTP |
| GET | `/analysis/suritls/<id>/` | Suricata TLS |
| GET | `/analysis/surifiles/<id>/` | Suricata files |
| GET | `/analysis/antivirus/<id>/` | AV 多引擎结果 |
| GET/POST | `/analysis/remove/<id>/` | 删除任务（HTML 确认） |
| GET/POST | `/analysis/signature-calls/<id>/` | 单 signature 命中点 API call 列表 |
| GET | `/analysis/chunk/<id>/<pid>/<page>/` | 单 PID 第 N 页 API calls |
| GET | `/analysis/filtered/<id>/<pid>/<category>/<api_list>/<caller>/<tid>/` | 过滤 API call |
| GET | `/analysis/file_nl/<cat>/<id>/<dl>/` | 不带 layout 的文件下载 |
| GET | `/analysis/search/` | 搜索页 |
| GET | `/analysis/search/<searched>/` | 带 query 的搜索 |
| POST | `/analysis/search/<id>/` | 任务内搜索 |
| GET | `/analysis/pending/` | 等待中任务页 |
| GET/POST | `/analysis/ban_user_tasks/<user_id>/` | 封禁 user 全部任务（admin） |
| GET/POST | `/analysis/ban_user/<user_id>/` | 封禁 user（admin） |
| GET | `/analysis/procdump/<id>/<pid>/<start>/<end>/[<zipped>/]` | 区间 procdump 下载 |
| GET/POST | `/analysis/reprocess/<id>/` | 重处理 |
| GET | `/analysis/failed/<id>/` | 失败任务详情 |
| GET | `/analysis/<id>/pcapstream/<conntuple>/` | 单 conn PCAP 流 |
| GET/POST | `/analysis/<id>/comments/` | 用户评论 CRUD |
| GET | `/analysis/on_demand/<service>/<id>/<cat>/<sha256>` | 触发按需 service（如 BinGraph） |

### 3.3 `/submit/`

| Method | Path | 描述 |
|---|---|---|
| GET/POST | `/submit/` | 提交向导（File / URL / Hash / Static / Quick / VT / Resubmit 8 tab） |
| GET/POST | `/submit/resubmit/<id>/<sha256>/` | 重提交（带原任务上下文） |
| GET | `/submit/status/<id>/` | 任务状态页（轮询友好） |
| GET | `/submit/remote_session/<id>/` | 远程 Guacamole 会话入口 |

### 3.4 `/compare/`

| Method | Path | 描述 |
|---|---|---|
| GET | `/compare/<left_id>/` | 单任务对比候选页 |
| GET | `/compare/<left_id>/<right_id>/` | 双任务行为差异页 |
| GET | `/compare/<left_id>/<right_hash>/` | 用 hash 而非 task_id 对比 |

### 3.5 `/audit/`

> 内部测试套件管理（cape 测试用例 / sample 库回归）；非常规生产路径。

| Method | Path | 描述 |
|---|---|---|
| GET | `/audit/[page/<n>/]` | 测试 session 列表 |
| GET | `/audit/session/<id>/` | session 详情 |
| GET | `/audit/session/<id>/status` | session 状态 |
| GET | `/audit/session/<id>/run_update/<testrun_id>/` | 单测试运行更新 |
| POST | `/audit/reload_available_tests/` | 重读 available tests |
| POST | `/audit/create_test_session/` | 建 session |
| POST | `/audit/delete_test_session/<id>/` | 删 session |
| POST | `/audit/session/<id>/queue_tests/` | 入队全部 |
| POST | `/audit/session/<id>/unqueue_tests/` | 出队全部 |
| POST | `/audit/session/<id>/queue_tests/<testrun_id>/` | 入队单条 |
| POST | `/audit/session/<id>/unqueue_tests/<testrun_id>/` | 出队单条 |
| POST | `/audit/update_task_config/<availabletest_id>/` | 改 test 配置 |

### 3.6 `/guac/` — Guacamole 远程会话

| Method | Path | 描述 |
|---|---|---|
| GET | `/guac/<task_id>/<session_data>/` | 进入 task 对应 VM 的 Guac session（base64 数据驱动） |

### 3.7 全局工件下载（顶层路由，非 `/apiv2/`）

| Method | Path | 描述 | 配置开关 |
|---|---|---|---|
| GET | `/file/<category>/<id>/<dlfile>/` | 下载任务 worktree 中具名文件 | `[download_file]` |
| GET | `/vtupload/<category>/<id>/<filename>/<dlfile>/` | 把工件转交 VirusTotal 上传 | n/a（页面级） |
| GET | `/filereport/<id>/<category>/` | 直接拉 JSON / HTML / PDF / cape report | `[filereport]` |
| GET | `/full_memory/<id>/` | 完整内存 dump | `[full_memory_dump_file]` |
| GET | `/full_memory_strings/<id>/` | 内存 strings | `[full_memory_dump_file_strings]` |

---

## 4. 鉴权 / 节流 / CSRF / CORS 速览

| 维度 | apiv2（Token） | apiv3（SPA） | 前端 HTML |
|---|---|---|---|
| Token | DRF `Token`（`/apiv2/api-token-auth/`） | 不支持 | 不支持 |
| Session | 支持（已登录浏览器调用兼容） | **必需** | **必需**（多数路由） |
| CSRF | `@csrf_exempt`，外部脚本无需带 | `X-CSRFToken` 必带（POST/DELETE） | Django 默认 CSRF |
| Throttle | `api.conf` 每端点 `rps + rpm`，全局 `default_user_ratelimit` | DRF settings 全局 throttle | 一般无；上传类有 `LIMITER` middleware |
| 关停 | `api.conf [<endpoint>].enabled = no` | 由 `[api] WEB_AUTHENTICATION` + 各 `[<endpoint>].enabled` 反向影响 SPA 表单 | 路由本身不可关闭，Django 视图层校验 |
| 错误 | `{error, error_value}` 信封 | `{code, message, ...}` 信封 + 标准 HTTP code | HTML 错误页 (`handler403`/`handler404`) |
| OpenAPI | 无 | `/api/v3/schema/` + `/api/v3/docs/` | n/a |
| 长连接 | `tasks/get/stream/<id>/`（poll-style） | `events/tasks`（SSE） | n/a |

---

## 5. 速率限制配置（`conf/api.conf`）字段汇总

每个 `api.conf` 内的 endpoint section 字段：

| 字段 | 取值 | 含义 |
|---|---|---|
| `enabled` | `yes / no` | 端点是否暴露；`no` 时返回 `{error: true, error_value: "<X> API is disabled"}` |
| `auth_only` | `yes / no` | 强制要求登录态 / token，匿名访问拒绝 |
| `rps` | 形如 `1/s` / `5/s` | 每秒请求数上限（IP 级） |
| `rpm` | 形如 `5/m` / `2/m` | 每分钟请求数上限（IP 级） |
| `mcp` | `yes / no` | 该端点是否注册到 MCP server（不影响 HTTP 接入） |
| `allmachines` | `yes / no` | 仅 create 类：允许 `machine=all` 多机分发 |
| `multifile` | `yes / no` | 仅 `[filecreate]`：允许多文件批量 |
| `status` | `yes / no` | 仅 create 类：响应中是否带状态页 callback URL |

全局：

| 字段（`[api]` section） | 含义 |
|---|---|
| `ratelimit = yes / no` | IP 级限速总开关 |
| `default_user_ratelimit` | 默认每用户兜底（`5/m`） |
| `default_subscription_ratelimit` | 订阅级兜底 |
| `token_auth_enabled` | apiv2 是否要求 token |
| `mcp` | MCP server 总开关 |
| `url` | 帮助页 / callback URL 主机 |

---

## 6. 调用方速查

### 写脚本（CI / 运营 / IR）

```bash
# 1. 拿 token（一次）
curl -s http://cape.example.com/apiv2/api-token-auth/ \
  -d username=alice -d password=... | jq -r .token

# 2. 用 token 提交
curl -s http://cape.example.com/apiv2/tasks/create/file/ \
  -H "Authorization: Token <key>" \
  -F file=@sample.exe -F machine=win10x64 -F timeout=120

# 3. 轮询状态
curl -s http://cape.example.com/apiv2/tasks/status/1234/ \
  -H "Authorization: Token <key>"

# 4. 拉 JSON 报告
curl -s http://cape.example.com/apiv2/tasks/get/report/1234/json/ \
  -H "Authorization: Token <key>" -o report.json
```

### SPA / 前端代码

```ts
// 全部走 /api/v3/，CSRF 自动从 cookie 取
const csrf = await fetch("/api/v3/auth/csrf/", { credentials: "include" });
const me   = await fetch("/api/v3/me/",        { credentials: "include" });
const tasks = await fetch("/api/v3/tasks/",    { credentials: "include" });
const sse  = new EventSource("/api/v3/events/tasks");
```

### 浏览器人工

直接进 `/`、`/submit/`、`/analysis/<id>/`、`/compare/<a>/<b>/`，所有交互都是 Django 渲染的 Bootstrap 页面 + jQuery + DataTables（上游 master），SPA fork 用 `frontend/app/` 重新覆盖了同 URL 模式。

---

## 7. 与上游差异

本仓库（`refactor/web-spa` 分支）相对 `kevoreilly/CAPEv2`：

- **新增** `web/apiv3/` 整层（views + urls + serializers + sse），上游没有 v3。
- **保留** `apiv2/` 全集（兼容外部脚本与 `utils/submit.py`）。
- **HTML 路由集合不动**，但 `frontend/app/_upstream/<path>` Vite 代理可在 v3 不可用时回退到上游 HTML scrape（参见 `frontend/app/src/lib/api/upstream-*-scrape.ts`）。
- **新增** `/api/v3/auth/csrf/` 与 SSE 事件流（`/api/v3/events/tasks`）。

---

## 8. 引用 / 进一步阅读

- 上游源：[kevoreilly/CAPEv2/web](https://github.com/kevoreilly/CAPEv2/tree/master/web)
- 上游 ReadTheDocs（apiv2 章节）：<https://capev2.readthedocs.io/en/latest/usage/api.html>
- 本 fork PRD：`docs/prd/web-spa-refactor.md`
- v3 OpenAPI（运行时）：`/api/v3/schema/` + `/api/v3/docs/`
- 配置默认值：`conf/default/api.conf.default`
- 路由源：`web/web/urls.py` + `web/<app>/urls.py`
- 视图源：`web/apiv2/views.py`、`web/apiv3/views.py`、`web/analysis/views.py`、`web/submission/views.py` 等
