# CAPEv2 Web SPA 重构 PRD

> **文档状态**：v1.0 / 已锁定 Understanding（2026-04-29）
> **作者**：基于 brainstorming 流程产出
> **范围**：CAPEv2 web 层从"Django 模板 SSR + DRF 旁挂"重构为前后端分离架构
> **硬约束**：完全不改变现有功能、不改数据 schema、不改 agent 协议
> **预期工时**：4-6 个月一人全职

---

## 目录

1. [背景](#1-背景)
2. [目标与非目标](#2-目标与非目标)
3. [范围](#3-范围)
4. [架构](#4-架构)
5. [数据契约](#5-数据契约)
6. [API 端点](#6-api-端点)
7. [前端架构](#7-前端架构)
8. [阶段路线图](#8-阶段路线图)
9. [风险登记](#9-风险登记)
10. [验收标准](#10-验收标准)
11. [附录 A：Decision Log](#附录-adecision-log)
12. [附录 B：Assumptions](#附录-bassumptions)
13. [附录 C：术语表](#附录-c术语表)

---

## 1. 背景

### 1.1 现状

CAPEv2 当前 web 层是 Django 4.2 单体应用，包含 9 个 Django app（`submission` / `analysis` / `apiv2` / `dashboard` / `users` / `audit` / `compare` / `captcha_admin` / `guac`）。架构特征：

- **同一 Django 进程**同时服务 HTML 模板（SSR）与 DRF JSON API
- 网页路由（`/analysis/<id>/`、`/submission/`、`/dashboard/`）通过 Django 模板渲染，**不消费** `/apiv2/`，直接读 ORM
- 前端栈：Bootstrap 5 + jQuery，无构建工具，静态资源散落 `web/static/`
- API 鉴权：DRF TokenAuth + SessionAuth（默认 `[api] token_auth_enabled = no`）
- 网页鉴权：django-allauth + 自定义 `@conditional_login_required` 装饰器
- 数据存储：PostgreSQL（任务/样本/机器） + MongoDB 或 Elasticsearch（分析结果） + 文件系统（`storage/analyses/<id>/`）
- 部署：systemd 四件套（`cape` / `cape-processor` / `cape-rooter` / `cape-web`）+ nginx + uwsgi

### 1.2 痛点（驱动力）

参见 brainstorming Q1 的 A+C+D：

- **A. 内部分析师日常使用体验差**：报告页 `/analysis/<id>/` 单页渲染整个分析（仓库里 `report.html` 静态产物 2.3MB），没有客户端路由、无实时推送、移动端不可用、改一个组件要改 Django 模板并重启 `cape-web`
- **C. 难以被其他内部系统消费**：`/apiv2/` 已存在但与网页 UI 共享同一 Django 进程；网页 UI 没走 API 这条路径，导致 UI 行为与 API 行为常有偏差，集成方反映"看到的跟 API 拿到的不一致"
- **D. 技术栈陈旧**：jQuery + Bootstrap + Django 模板，前端工程师招聘困难、二次开发 / a11y / 移动端适配成本高、无法接入现代前端生态（数据可视化、组件库、设计系统）

### 1.3 已有相关工作

- [`docs/workflow/`](../workflow/README.md)：HTTP-only 端到端工作流文档，证明 `/apiv2/` 已能完整支撑客户端集成
- [`docs/agent/`](../agent/README.md)：Guest agent 部署文档
- 设计稿：[`frontend/web-design/`](../../frontend/web-design/)（React JSX，含完整组件骨架与数据契约）

---

## 2. 目标与非目标

### 2.1 目标

| ID | 目标 | 衡量方式 |
|---|---|---|
| G1 | **功能 100% 对齐当前 SSR 网页** | MVP 上线后，对照功能矩阵逐项 E2E 验证通过 |
| G2 | **前后端真正分离**：SPA 独立工程、独立镜像、独立发版 | CI 出两个 Docker 镜像；前端可单独 release tag |
| G3 | **改善内部分析师交互体验** | 报告页 TTI < 3s（局域网）；tab 切换 < 1s；任务列表 100 行加载 < 1s |
| G4 | **API 契约可消费、可文档化** | `/api/v3/` 全部端点有 OpenAPI（drf-spectacular），SPA 内嵌 Swagger UI |
| G5 | **不破坏现有客户端** | `/apiv2/` 永久保留，行为 / 响应 / 错误格式不变 |
| G6 | **数据/Agent/Conf 零改动** | 任何 `lib/cuckoo/`、`agent/`、`conf/` 相关文件不在 PR 范围 |
| G7 | **可维护性** | 单人可在 4-6 个月内完成 MVP；OpenAPI 自动同步；服务层有单元测试覆盖 |

### 2.2 非目标（明确不做）

| ID | 非目标 |
|---|---|
| NG1 | 新的 RBAC 模型——沿用 staff/superuser + UserProfile |
| NG2 | 替换 Django admin |
| NG3 | 替换 allauth 任何页面（注册 / 邮件 / OAuth / 2FA / captcha / 密码重置全保留） |
| NG4 | 下线 `/apiv2/` |
| NG5 | 修改 `agent.py` 协议 |
| NG6 | 修改 Postgres / Mongo / Elasticsearch schema 或字段路径 |
| NG7 | 修改 `conf/` 配置体系 |
| NG8 | SSO（LDAP / OIDC / SAML） |
| NG9 | 多租户、SaaS 化 |
| NG10 | 移动端原生 App |
| NG11 | "API 端点能力可视化配置"页面（`api.conf` 仍手工改） |
| NG12 | 用户 token 自助管理 UI（Django admin 处理） |
| NG13 | 替换 reporting / processing / scheduler 模块 |
| NG14 | 引入新的存储后端 |
| NG15 | 分布式 controller（`utils/dist.py`）的 SPA 化 |

---

## 3. 范围

### 3.1 MVP（P0）

#### 页面

| # | 页面 | 当前对应 SSR | 备注 |
|---|---|---|---|
| 1 | **Submit**：文件 / URL 提交 + 18 高级参数表单 | `/submission/` | |
| 2 | **Recent**：任务列表 + 搜索 / 过滤 / 排序 / 分页 | `/analysis/` | |
| 3 | **Pending**：运行中任务实时状态推送（SSE） | `/analysis/pending/` | 新增实时推送能力 |
| 4 | **Search**：跨 hash / 字段的扩展搜索 | `/analysis/search/` | |
| 5 | **Compare**：两个分析的 diff 视图 | `/compare/` | 需新建 v3 端点 |
| 6 | **Statistics / Dashboard**：今日提交、家族 top N、机器使用率、告警 feed | `/dashboard/` | |
| 7 | **Report**：分析报告（9 tab：Summary / Static / Behavior / Network / Dropped / Screenshots / Payloads / ATT&CK / Config） | `/analysis/<id>/` | **最复杂**，需要分块 API |
| 8 | **Machines**：机器/VM 列表 + 状态 | `/machines/` | |
| 9 | **Audit**：审计日志查看 | `/audit/` | 设计稿外补，新建 v3 端点 |
| 10 | **API Docs**（导航项）：嵌入式 OpenAPI viewer | 跳 `/apiv2/` 自查页 | SPA 内嵌 Swagger UI |
| 11 | **Login bridge**：未登录跳 allauth 登录页 | `/accounts/login/` | 不渲染，直接 302 |

#### 后端能力

- `/api/v3/` 命名空间（DRF Serializer + drf-spectacular）
- `web/services/` 服务层：`task_service`、`report_service`、`compare_service`、`audit_service`、`attack_service`
- SSE 推送端点：`/api/v3/events/tasks`（仅 session 鉴权）
- `web/permissions.py` 整合 TLP / 速率限制 / `api.conf` gate
- OpenAPI schema 暴露：`/api/v3/schema/`、Swagger UI：`/api/v3/docs/`

### 3.2 第二阶段（P1）

| # | 项目 | 说明 |
|---|---|---|
| P1-1 | 报告内子操作：删除 / 重排队 / 重处理 / 加 tag / 加 comment | 散落在报告页的按钮 |
| P1-2 | 批量操作：多选删除、批量 reschedule、批量打 tag | 列表页扩展 |
| P1-3 | Configs 页：CAPE 配置提取家族浏览器 | 设计稿已画，路由保留 stub，端点延后 |

### 3.3 范围外（OUT）

参见 [§2.2 非目标](#22-非目标明确不做)。

---

## 4. 架构

### 4.1 部署拓扑

```
                              ┌─────────────────┐
                              │   nginx (TLS)   │ :443/:80
                              │  same-origin    │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼─────────────────────────────────┐
        │                              │                                 │
        ▼                              ▼                                 ▼
   /  /tasks  /reports               /api/        /admin/  /accounts/
   /submit  /machines               (uwsgi)        /static/admin/
   /dashboard ...                                  (uwsgi)
        │                              │                                 │
   ┌────▼────────┐               ┌─────▼─────┐                     ┌─────▼──────┐
   │  cape-spa   │               │  cape-web │                     │  cape-web  │
   │  (nginx     │               │   (uwsgi  │                     │  (uwsgi    │
   │   alpine)   │               │   Django) │                     │   Django)  │
   │  React SPA  │               │  /api/v2/ │                     │  /admin/   │
   │  + Swagger  │               │  /api/v3/ │                     │  /accounts/│
   │  UI         │               │  + SSE    │                     │            │
   └─────────────┘               └─────┬─────┘                     └─────┬──────┘
                                       │                                 │
                                       └──────────────┬──────────────────┘
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │   PostgreSQL  +  Mongo/ES    │
                                       │   storage/analyses/          │
                                       └──────────────────────────────┘
```

**注**：`cape-web` 进程未变。`cape-spa` 是新增的 nginx-alpine 镜像，**仅静态文件直出**，不做反代（反代由前置 nginx 完成）。

### 4.2 进程与镜像

| 镜像 | 用途 | 基础 | 关键内容 |
|---|---|---|---|
| `cape-web`（现有，**不重命名**） | Django + DRF | 现有 base | 跑 uwsgi，挂 `/api/v2/`、`/api/v3/`、`/admin/`、`/accounts/` |
| `cape-spa`（**新增**） | SPA 静态文件 + Swagger UI | nginx-alpine | 把 `frontend/app/dist/` 的产物 COPY 进去；配 history fallback (`try_files $uri /index.html`) |

### 4.3 nginx 路由表

```nginx
# 简化示意；生产配置需要补 TLS / HSTS / 健康检查
upstream cape_web { server cape-web:8000; }
upstream cape_spa { server cape-spa:80; }

server {
    listen 443 ssl;

    # 1) Django 区
    location /api/v2/        { proxy_pass http://cape_web; }
    location /api/v3/        { proxy_pass http://cape_web; }
    location /api/v3/events/ {                                   # SSE 特殊配置
        proxy_pass http://cape_web;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 24h;
    }
    location /admin/         { proxy_pass http://cape_web; }
    location /accounts/      { proxy_pass http://cape_web; }
    location /static/admin/  { proxy_pass http://cape_web; }      # Django admin 自带静态
    location /static/rest_framework/ { proxy_pass http://cape_web; }

    # 2) SPA 区（兜底）
    location / { proxy_pass http://cape_spa; }
}
```

### 4.4 鉴权流（方案 A：Session + CSRF）

```
┌─ 浏览器 ────┐
│ 访问 /     │
└──────┬─────┘
       │ 1) GET /  → cape-spa 返回 index.html
       │ 2) SPA 启动，调 /api/v3/me/  →  401（无 session）
       │ 3) SPA 跳到 /accounts/login/（cape-web Django allauth 渲染）
       │ 4) 用户提交账密 → allauth 验证 → 设 sessionid cookie
       │ 5) allauth 重定向到 LOGIN_REDIRECT_URL（/）
       │ 6) SPA 重新启动，再调 /api/v3/me/  →  200，拿到用户信息
       │ 7) 后续所有 fetch：
       │      - GET 直接发，cookie 自动带
       │      - POST/PUT/DELETE 先调 /api/v3/auth/csrf/ 拿 token，塞 X-CSRFToken 头
       └─...
```

OAuth / 2FA / 密码重置 / 邮件确认全部在 allauth 网页里完成，SPA 不参与。

### 4.5 SSE 流

```
┌─ SPA ────────────────────────────────────┐
│ const es = new EventSource(             │
│   '/api/v3/events/tasks',               │
│   { withCredentials: true }              │
│ );                                       │
│ es.addEventListener('status', e => {    │
│   const { task_id, status } = JSON.parse(e.data);
│   queryClient.invalidateQueries(['task', task_id]);
│ });                                      │
└──────┬───────────────────────────────────┘
       │ session cookie 自动带
       ▼
┌─ Django ASGI（daphne，仅本端点）────────┐
│ async def task_event_stream(request):    │
│   # 监听 task 状态变化（DB trigger / Postgres LISTEN/NOTIFY 或轮询）
│   while True:                            │
│     for change in poll_changes(user):   │
│       yield f"event: status\ndata: {json.dumps(change)}\n\n"
│     await asyncio.sleep(2)               │
└──────────────────────────────────────────┘
```

后端实现细节见 [§6.5 实时推送端点](#65-实时推送端点)。

---

## 5. 数据契约

### 5.1 字段命名约定（D-14 锁定）

后端 v3 端点的输出 shape 以 [`frontend/web-design/data.js`](../../frontend/web-design/data.js) 中 `CAPE_DATA` 为准。关键约定：

- **扁平命名**：`signatures_count` 而非 `signatures.count`、`yara_matches` 而非 `yara.matches`
- **时间字段**：UTC + ISO 8601 字符串（前端按用户本地时区显示）
- **hash 字段**：小写 hex
- **score 字段**：浮点 0-10
- **severity 枚举**：`crit` / `high` / `med` / `low` / `clean`（与 `--sev-*` CSS 变量对齐）
- **verdict 枚举**：`malicious` / `suspicious` / `clean`

### 5.2 Task 摘要 Schema（用于列表 / 报告头）

```typescript
interface TaskSummary {
  id: number;
  target: string;
  sha256: string;
  sha1: string;
  md5: string;
  size: number;
  type: string;                           // libmagic 字符串
  submitted: string;                      // ISO 8601 UTC
  started: string | null;
  completed: string | null;
  duration: string | null;                // 人友好字符串 "5m 45s"
  machine: string | null;
  package: string;
  score: number;                          // 0-10
  severity: 'crit' | 'high' | 'med' | 'low' | 'clean';
  verdict: 'malicious' | 'suspicious' | 'clean';
  family: string | null;
  signatures_count: number;
  yara_matches: number;
  network_count: number;
  files_dropped: number;
  payloads: number;
  api_calls: number;
  status: TaskStatus;                      // 见下
  tags: string[];
}

type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'reported'
  | 'failed_analysis'
  | 'failed_processing'
  | 'failed_reporting';
```

### 5.3 Signature Schema

```typescript
interface Signature {
  name: string;
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;
  categories: string[];
  ttp: string[];                           // ATT&CK technique IDs，如 "T1055"
  marks: SignatureMark[];                  // 触发证据
}

interface SignatureMark {
  type: 'call' | 'file' | 'registry' | 'network' | 'mutex' | 'process' | 'generic';
  pid?: number;
  api?: string;
  arguments?: Record<string, unknown>;
  detail?: string;
}
```

### 5.4 ATT&CK Schema（对应 D-23、OQ2）

直接 reuse `lib/cuckoo/common/mapTTPs.py` 的输出结构：

```typescript
interface AttackMatrix {
  tactics: AttackTactic[];                 // 14 个标准 tactics
  total_techniques: number;
  total_subtechniques: number;
}

interface AttackTactic {
  id: string;                              // "TA0002"
  name: string;                            // "Execution"
  techniques: AttackTechnique[];
}

interface AttackTechnique {
  id: string;                              // "T1059"
  name: string;
  matched: boolean;
  hits: number;                            // 命中的 signatures 数量
  signatures: string[];                    // signature 名字列表
  subtechniques?: AttackTechnique[];
}
```

### 5.5 SSE 事件 Schema

```typescript
type SSEEvent =
  | { type: 'task.status'; task_id: number; status: TaskStatus; ts: string }
  | { type: 'task.added';  task: TaskSummary; ts: string }
  | { type: 'task.deleted'; task_id: number; ts: string }
  | { type: 'machine.status'; name: string; status: 'running' | 'idle' | 'maintenance'; ts: string }
  | { type: 'heartbeat'; ts: string };     // 每 30s 一次，防代理超时
```

### 5.6 错误响应 Schema（v3 强制）

```typescript
interface ApiError {
  error: true;
  error_code: string;                      // 'task_not_found' / 'tlp_red' / ...
  error_value: string;                     // 人类可读
  details?: Record<string, unknown>;
}

interface ApiSuccess<T> {
  error: false;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    next_cursor?: string;
  };
}
```

v3 端点的 HTTP 状态码必须语义正确（4xx 客户端、5xx 服务端），与 v2 的"全 200 + body 标 error"分离。

---

## 6. API 端点

### 6.1 现状（不动）

`/api/v2/`（即 `/apiv2/`）所有 ~45 个端点保留，行为不变。完整列表见 [`docs/workflow/http_api_spec.md`](../workflow/http_api_spec.md)。

### 6.2 v3 新增端点（MVP 必须）

#### 6.2.1 鉴权辅助

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/auth/csrf/` | GET | 返回 CSRF token（SPA 启动时调一次） |
| `/api/v3/me/` | GET | 当前用户信息（用户名、is_staff、subscription、reports 权限） |

#### 6.2.2 任务（薄包装现有 v2 视图）

| 端点 | 方法 | 用途 | 后端复用 |
|---|---|---|---|
| `/api/v3/tasks/` | GET | 任务列表（支持 cursor 分页 / 多字段过滤 / 排序） | `db.list_tasks()` |
| `/api/v3/tasks/<id>/` | GET | 任务摘要（TaskSummary） | `db.view_task()` |
| `/api/v3/tasks/search/` | POST | 扩展搜索（同 v2 ext_tasks_search） | service 层封装 |

#### 6.2.3 报告（分块）

| 端点 | 方法 | 用途 | 备注 |
|---|---|---|---|
| `/api/v3/reports/<task_id>/summary/` | GET | 摘要数据 + 9 tab 计数 | 报告页头 |
| `/api/v3/reports/<task_id>/static/` | GET | PE 静态信息（节、字符串、证书、imports） | |
| `/api/v3/reports/<task_id>/behavior/` | GET | 进程树 + API 调用统计（不返完整 18.4k 调用） | |
| `/api/v3/reports/<task_id>/behavior/calls/` | GET | API 调用列表（cursor 分页，10k+ 不能一次返） | |
| `/api/v3/reports/<task_id>/network/` | GET | 网络数据：domains、hosts、http、tls、connections | |
| `/api/v3/reports/<task_id>/dropped/` | GET | dropped 文件元数据（不含二进制） | |
| `/api/v3/reports/<task_id>/screenshots/` | GET | 截图索引（数量 + URL 列表，不含图本身） | |
| `/api/v3/reports/<task_id>/payloads/` | GET | payloads 元数据 | |
| `/api/v3/reports/<task_id>/attack/` | GET | ATT&CK 矩阵（D-23 + OQ2） | 直接复用 `mapTTPs.py` 输出 |
| `/api/v3/reports/<task_id>/config/` | GET | CAPE 配置提取结果 | |
| `/api/v3/reports/<task_id>/signatures/` | GET | 签名命中列表 | |

> **二进制文件下载继续走 v2**：`/apiv2/tasks/get/{pcap,dropped,payloadfiles,procmemory,fullmemory,...}/<id>/`。SPA 直接 `<a href>` 触发，浏览器 cookie 鉴权。

#### 6.2.4 比较

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/compare/` | POST | body `{task_ids: [a, b]}`，返回两份分析的 diff（network、signatures、ttps） |

#### 6.2.5 仪表盘 / 统计

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/dashboard/summary/` | GET | 今日提交量、家族 top N、最近告警 |
| `/api/v3/dashboard/trends/` | GET | 7 天 / 30 天趋势（query param `window`） |

#### 6.2.6 机器

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/machines/` | GET | 列表（含状态、tags、当前 task） |
| `/api/v3/machines/<name>/` | GET | 单机详情 |

#### 6.2.7 审计日志（D-24）

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/audits/` | GET | cursor 分页、字段过滤（user / action / target） |
| `/api/v3/audits/<id>/` | GET | 单条详情 |

#### 6.2.8 系统

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/system/info/` | GET | 版本、构建号、运行时长 |
| `/api/v3/system/feature-flags/` | GET | 当前 `api.conf` enabled 各项的快照 |
| `/api/v3/system/queue/` | GET | 队列长度、worker 状态 |
| `/api/v3/schema/` | GET | OpenAPI 3.1 schema（drf-spectacular 自动生成） |
| `/api/v3/docs/` | GET | Swagger UI（嵌入式） |

### 6.3 SSE 实时推送

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/events/tasks` | GET (text/event-stream) | 实时推送：任务状态变更、新增任务、机器状态变更 |

事件类型见 [§5.5](#55-sse-事件-schema)。

### 6.4 P1 阶段新增端点（非 MVP）

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/v3/tasks/<id>/` | DELETE | 删除任务（替代 v2 的 GET delete） |
| `/api/v3/tasks/<id>/reschedule/` | POST | 重新排队 |
| `/api/v3/tasks/<id>/reprocess/` | POST | 重跑后处理 |
| `/api/v3/tasks/<id>/comments/` | GET / POST | 评论列表 / 添加评论 |
| `/api/v3/tasks/<id>/tags/` | POST / DELETE | 加 / 删 tag |
| `/api/v3/tasks/bulk/delete/` | POST | 批量删除 |
| `/api/v3/configs/` | GET | 按家族聚合 CAPE 配置（P1-3） |

### 6.5 实时推送端点详细设计

**实现策略**：

- ASGI 进程独立部署（`channels[daphne]` 已在 `pyproject.toml`）
- 不引入 Redis pub/sub，第一阶段采用 **Postgres LISTEN/NOTIFY**（成本低）或 **2 秒数据库轮询**（更简单）
- 心跳：每 30 秒 `event: heartbeat\ndata: {"ts": "..."}`，防 nginx/proxy 超时
- 鉴权：仅 session（D-12.1）。`request.user` 从 Django session 解析；未登录直接 403

```python
# web/apiv3/sse.py（伪代码）
async def task_events(request):
    user = request.user
    if not user.is_authenticated:
        return HttpResponse(status=403)

    async def stream():
        last_seen = await get_latest_event_id()
        while True:
            events = await fetch_events_since(last_seen, user)
            for e in events:
                yield f"event: {e.type}\ndata: {json.dumps(e.payload)}\n\n"
                last_seen = e.id
            yield ":heartbeat\n\n"   # 注释行作为心跳
            await asyncio.sleep(2)

    return StreamingHttpResponse(stream(), content_type="text/event-stream")
```

---

## 7. 前端架构

### 7.1 目录结构（D-19）

```
frontend/
├── web-design/              ← 现有设计稿，保留不动（参考用）
│   ├── cape-shell.jsx
│   ├── cape-pages-*.jsx
│   ├── styles.css
│   └── data.js
└── app/                     ← 新建生产代码
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.ts   # v4 用 @theme 配置
    ├── index.html
    ├── public/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── routes/                           # React Router 7
    │   │   ├── _root.tsx                    # 顶层 layout（Shell）
    │   │   ├── dashboard/index.tsx
    │   │   ├── submit/index.tsx
    │   │   ├── recent/index.tsx
    │   │   ├── pending/index.tsx
    │   │   ├── search/index.tsx
    │   │   ├── compare/index.tsx
    │   │   ├── stats/index.tsx
    │   │   ├── machines/index.tsx
    │   │   ├── audit/index.tsx
    │   │   ├── docs/index.tsx               # 嵌入 Swagger UI
    │   │   ├── tasks/[id]/index.tsx         # report 页（含 9 tabs）
    │   │   └── login-bridge.tsx             # 跳 allauth
    │   ├── components/
    │   │   ├── shell/                       # Topbar / Sidebar / Statusbar
    │   │   ├── ui/                          # shadcn 复制下来的源码
    │   │   ├── report/                      # 报告页 9 tab 子组件
    │   │   │   ├── tabs/
    │   │   │   │   ├── SummaryTab.tsx
    │   │   │   │   ├── StaticTab.tsx
    │   │   │   │   ├── BehaviorTab.tsx      # React Flow process tree
    │   │   │   │   ├── NetworkTab.tsx       # React Flow topology + Recharts time
    │   │   │   │   ├── DroppedTab.tsx
    │   │   │   │   ├── ScreenshotsTab.tsx
    │   │   │   │   ├── PayloadsTab.tsx
    │   │   │   │   ├── AttackTab.tsx        # CSS grid matrix
    │   │   │   │   └── ConfigTab.tsx        # JSON tree
    │   │   │   ├── ScoreBadge.tsx
    │   │   │   ├── VerdictBanner.tsx
    │   │   │   └── SignatureRail.tsx
    │   │   └── shared/                      # 通用组件
    │   ├── lib/
    │   │   ├── api/                         # axios + interceptors
    │   │   │   ├── client.ts
    │   │   │   ├── csrf.ts                  # 自动注入 X-CSRFToken
    │   │   │   ├── tasks.ts                 # 各 endpoint 客户端
    │   │   │   ├── reports.ts
    │   │   │   ├── compare.ts
    │   │   │   ├── audits.ts
    │   │   │   └── system.ts
    │   │   ├── sse/                         # SSE 客户端封装
    │   │   │   └── tasks.ts
    │   │   ├── query-keys.ts                # TanStack Query 全局 key 注册表
    │   │   ├── tokens/                      # design tokens（从 styles.css 迁过来）
    │   │   │   └── theme.css
    │   │   └── utils/
    │   ├── hooks/
    │   │   ├── useTaskList.ts
    │   │   ├── useReport.ts
    │   │   ├── useTaskEvents.ts             # SSE hook
    │   │   └── useFeatureFlags.ts
    │   └── types/                           # 与 v3 端点对齐的 TS 类型
    │       └── api.ts
    ├── tests/
    │   ├── unit/                            # Vitest
    │   └── e2e/                             # Playwright
    └── docs/
        └── README.md                        # 前端开发指南
```

### 7.2 路由表

| 路径 | 组件 | 数据 |
|---|---|---|
| `/` | redirect → `/dashboard` | |
| `/dashboard` | `routes/dashboard` | `useDashboard()` |
| `/submit` | `routes/submit` | mutation only |
| `/recent` | `routes/recent` | `useTaskList({ status: 'reported' })` |
| `/pending` | `routes/pending` | `useTaskList({ status: 'running' })` + SSE |
| `/search` | `routes/search` | `useSearch(form)` mutation |
| `/compare` | `routes/compare` | `useCompare([a,b])` mutation |
| `/stats` | `routes/stats` | `useDashboard()` + `useTrends()` |
| `/machines` | `routes/machines` | `useMachines()` + SSE |
| `/audit` | `routes/audit` | `useAudits()` |
| `/docs` | `routes/docs` | iframe Swagger UI |
| `/tasks/:id` | `routes/tasks/[id]` | `useReportSummary(id)` + tab 内 lazy load |
| `/login-bridge` | redirect → `/accounts/login/?next=/` | |

### 7.3 TanStack Query Key 设计

```typescript
// frontend/app/src/lib/query-keys.ts
export const queryKeys = {
  me: ['me'] as const,
  tasks: {
    all: ['tasks'] as const,
    list: (filters: TaskListFilters) => ['tasks', 'list', filters] as const,
    detail: (id: number) => ['tasks', 'detail', id] as const,
  },
  reports: {
    all: ['reports'] as const,
    summary: (id: number) => ['reports', id, 'summary'] as const,
    static:  (id: number) => ['reports', id, 'static'] as const,
    behavior: (id: number) => ['reports', id, 'behavior'] as const,
    behaviorCalls: (id: number, cursor?: string) => ['reports', id, 'behavior', 'calls', cursor] as const,
    network: (id: number) => ['reports', id, 'network'] as const,
    dropped: (id: number) => ['reports', id, 'dropped'] as const,
    screenshots: (id: number) => ['reports', id, 'screenshots'] as const,
    payloads: (id: number) => ['reports', id, 'payloads'] as const,
    attack: (id: number) => ['reports', id, 'attack'] as const,
    config: (id: number) => ['reports', id, 'config'] as const,
    signatures: (id: number) => ['reports', id, 'signatures'] as const,
  },
  machines: {
    all: ['machines'] as const,
    detail: (name: string) => ['machines', name] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
    trends: (window: string) => ['dashboard', 'trends', window] as const,
  },
  audits: {
    list: (filters: AuditFilters) => ['audits', filters] as const,
  },
  system: {
    info: ['system', 'info'] as const,
    flags: ['system', 'flags'] as const,
  },
};
```

SSE 事件到来时按 task_id invalidate：
```typescript
es.addEventListener('task.status', (e) => {
  const { task_id } = JSON.parse(e.data);
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(task_id) });
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
});
```

### 7.4 设计 tokens 迁移

`frontend/web-design/styles.css` 里的 CSS variables 迁到 Tailwind v4 的 `@theme`：

```css
/* frontend/app/src/lib/tokens/theme.css */
@import "tailwindcss";

@theme {
  /* Severity */
  --color-sev-crit:  oklch(0.66 0.20 22);
  --color-sev-high:  oklch(0.74 0.16 50);
  --color-sev-med:   oklch(0.81 0.14 88);
  --color-sev-low:   oklch(0.85 0.10 230);
  --color-sev-clean: oklch(0.78 0.12 155);

  /* Backgrounds */
  --color-bg-0: #0a0d12;
  --color-bg-1: #0f131a;
  --color-bg-2: #161b24;

  /* Foregrounds */
  --color-fg-0: #e6e9ef;
  --color-fg-1: #b3b9c5;
  --color-fg-2: #6b7280;

  /* Density tokens */
  --spacing-row-dense:   28px;
  --spacing-row-regular: 36px;
  --spacing-row-comfy:   44px;

  /* Accent (可调) */
  --color-accent: oklch(0.78 0.13 220);
}
```

### 7.5 关键依赖清单

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-table": "^8.0.0",
    "@xyflow/react": "^12.0.0",
    "@dagrejs/dagre": "^1.0.0",
    "recharts": "^2.0.0",
    "react-hook-form": "^7.0.0",
    "zod": "^3.0.0",
    "@hookform/resolvers": "^3.0.0",
    "axios": "^1.0.0",
    "lucide-react": "^0.0.0",
    "@radix-ui/react-*": "*",
    "tailwindcss": "^4.0.0",
    "swagger-ui-react": "^5.0.0",
    "react-json-view-lite": "^1.0.0",
    "zustand": "^4.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "@playwright/test": "^1.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

### 7.6 前端测试策略

| 类别 | 工具 | 范围 |
|---|---|---|
| 单元 | Vitest | hooks、utils、纯函数（如 severity 计算、时间格式化） |
| 组件 | Vitest + Testing Library | 关键复用组件（ScoreBadge、SignatureRail、表格分页） |
| E2E | Playwright | 4 个核心路径：提交流程、列表筛选、报告 9 tab 切换、Compare diff |

---

## 8. 阶段路线图

按周估算，单人全职。每周 5 个工作日，每月 4 周。

### 阶段 1：脚手架 + Spike（2-3 周）

| Day | 内容 |
|---|---|
| W1 | Vite + TS + Tailwind v4 + shadcn/ui 起手；Docker 镜像（cape-spa）；nginx 路由切分 |
| W1 | Session+CSRF 鉴权流跑通：登录跳转、`/api/v3/auth/csrf/`、`/api/v3/me/` 三个端点 |
| W2 | **报告页 spike**：把 `web/templates/analysis/report.html` 完整读一遍，列出所有 `{% if %}` 分支与 JS 模块；产出 `docs/prd/report-page-spec.md` |
| W2 | **SSE spike**：daphne 部署、`/api/v3/events/tasks` minimal demo、SPA EventSource 接入 |
| W3 | drf-spectacular 接入；`web/services/` 服务层骨架；`web/permissions.py` 第一版 |

**产出**：可登录、可访问空 SPA、能拿到 `/api/v3/me/`、SSE 心跳通、Swagger UI 跑起来。

### 阶段 2：核心 CRUD（3-4 周）

| Week | 内容 |
|---|---|
| W4 | Submit 表单（react-hook-form + zod，18 参数表单 + 文件上传） |
| W5 | Recent 列表（TanStack Table + TanStack Query 分页 + 过滤 + 排序） |
| W6 | Pending 列表 + SSE 实时刷新 |
| W7 | Search 页（扩展搜索表单） |

**产出**：分析师能从 SPA 完成"提交→等→查"全闭环（不含报告页）。

### 阶段 3：报告页（5-7 周，最重）

| Week | 内容 |
|---|---|
| W8  | 报告页头（VerdictBanner + ScoreBadge）+ tab 路由 |
| W8  | Summary tab + Findings 侧栏 |
| W9  | Static tab |
| W10-11 | Behavior tab（React Flow 进程树 + dagre 自动布局 + 调用列表 cursor 分页） |
| W12 | Network tab（React Flow 拓扑 + Recharts 时序） |
| W13 | Dropped + Screenshots + Payloads 三个 tab（相对简单） |
| W14 | ATT&CK tab（CSS grid matrix）+ Config tab（JSON tree）+ Signatures rail |

**产出**：报告页 9 tab 全功能。

### 阶段 4：补 v3 端点 + 配套页（3-4 周）

| Week | 内容 |
|---|---|
| W15 | `/api/v3/compare/` + Compare 页 |
| W16 | `/api/v3/audits/` + Audit 页 |
| W17 | `/api/v3/dashboard/*` + Dashboard 页 + Stats 页 |
| W18 | `/api/v3/machines/` + Machines 页 |

### 阶段 5：API Docs + 长尾 + 打磨（2-3 周）

| Week | 内容 |
|---|---|
| W19 | Swagger UI 嵌入（`/docs` 路由）；OpenAPI schema 校验 |
| W20 | 国际化（en + zh） |
| W21 | 设计 tokens 全部迁移；dark mode 切换；density 切换 |

### 阶段 6：QA + 上线（2-3 周）

| Week | 内容 |
|---|---|
| W22 | E2E 测试（Playwright 4 路径）；性能测试（Lighthouse 报告） |
| W23 | 跟现有 SSR 页面逐项对照，补遗漏 |
| W24 | 部署到 staging；分析师试用反馈；修 P0 bug；release |

**总计**：22-24 周（5-6 个月）。

### 关键 milestone

| 时间点 | milestone |
|---|---|
| 月末 1 | 脚手架完成、登录通、SSE demo 跑 |
| 月末 2 | 核心 CRUD 通（不含报告页） |
| 月末 4 | 报告页全功能 |
| 月末 5 | MVP 全部 P0 完成 |
| 月末 6 | release 给内部分析师 |

---

## 9. 风险登记

| ID | 风险 | 等级 | 触发场景 | 对冲措施 |
|---|---|---|---|---|
| R1 | 报告页复杂度高估难 | 高 | 阶段 3 超时 50%+ | 阶段 1 强制 spike，产出 `report-page-spec.md` 作为 W8 起点 |
| R2 | 单人维护节奏，期间需求会变 | 中 | 中期被插需求 | 每月 milestone 评审；超 6 个月砍 P1 |
| R3 | 设计图未到位影响 UI 实现 | 中 | 阶段 2-3 阻塞 | 阻塞期做 API + service 层；UI 等图 |
| R4 | v3 与 v2 业务逻辑双轨维护 | 中 | bug 修一遍要查两处 | 共用业务逻辑提到 `web/services/`；v2 视图后续也调 service |
| R5 | TLP / 速率 / api.conf gate 三套权限分散 | 中 | 安全 bug | 阶段 1 写 `web/permissions.py` 统一，v3 强制走 |
| R6 | TanStack Query + SSE 状态机复杂 | 低 | 状态不一致 / 内存泄漏 | 阶段 1 spike；写 `useTaskEvents()` hook 集中处理 |
| R7 | Mongo 字段路径硬编码扩散 | 中 | 后期改字段全文搜 | v3 端点禁直读 Mongo，必须经 `report_service.py` |
| R8 | drf-spectacular 跟手写视图不兼容 | 低 | OpenAPI 报错 | v3 全用 Serializer；v2 不接 spectacular |
| R9 | 70% 测试覆盖压力大 | 中 | 进度被测试拖慢 | 后端覆盖按"每端点 happy + 1 error path"算；前端只测 4 路径 |
| R10 | CSRF token 在 SPA 端易踩坑 | 低 | unsafe 请求 403 | 写 axios interceptor 统一处理；启动时 `/api/v3/auth/csrf/` 拿 |
| R11 | Postgres LISTEN/NOTIFY 在生产稳定性未知 | 中 | SSE 漏推送 | 阶段 1 用 2s 轮询作为兜底；性能不够再切 LISTEN/NOTIFY |
| R12 | `[api] token_auth_enabled` 强开后旧客户端崩 | 低 | 现网客户端无 token | release notes 提前公告；提供 token 自助生成命令文档 |
| R13 | nginx SSE 配置错（缓冲未关）导致心跳失效 | 低 | 长连接被切 | 部署文档明确 `proxy_buffering off`；E2E 包含 SSE 心跳测试 |
| R14 | 设计稿 tokens 跟 Tailwind v4 配色阶不匹配 | 低 | 视觉对不齐 | 阶段 1 末尾完成 tokens 迁移，让设计师过一眼 |
| R15 | 单人维护期间生病/休假 | 中 | 进度停 | 每周提交 PR；文档 + ADR 同步；任何阶段都能交接 |

---

## 10. 验收标准

### 10.1 功能验收

#### 10.1.1 与现状对照矩阵

写一份 `docs/prd/feature-parity-checklist.md`，列出当前 SSR 网页所有功能点（约 50-80 项），逐项验证 SPA 等价。release 前要求 100% 通过。

#### 10.1.2 E2E 路径

| # | 路径 | 验收项 |
|---|---|---|
| E1 | 提交→轮询→报告 | 上传一个样本 → SPA 跳到 Pending → 状态自动从 pending → running → reported → 跳到报告页 → 9 tab 都有数据 |
| E2 | 列表筛选 + 排序 | 在 Recent 页：按 score 排序、按 family 过滤、按时间窗筛选，URL 状态可分享 |
| E3 | Compare diff | 选两个 reported 任务 → diff 视图正确高亮差异 |
| E4 | 跨页搜索 | 输 hash → 跳搜索结果；输家族名 → 列表过滤 |

### 10.2 非功能验收

| 类别 | 指标 | 阈值 |
|---|---|---|
| 性能 | SPA 首屏 TTI（局域网） | < 3s |
| 性能 | 路由切换 | < 500ms |
| 性能 | Lighthouse Performance | > 80 |
| 性能 | 报告页 tab 切换 | < 1s |
| 性能 | 任务列表 100 行加载 | < 1s |
| 实时 | SSE 状态变化到 UI 反映 | < 5s |
| 安全 | CSP 启用、无内联 script、无 unsafe-eval | 通过 |
| 兼容 | 最新 2 版 Chrome / Edge / Firefox | 全部通过 |
| 测试 | v3 端点单测覆盖（按"每端点 happy + 1 error"） | 100% |
| 测试 | 前端 E2E 4 路径 | 全过 |
| 文档 | OpenAPI schema 通过 spectacular validate | 0 error |

### 10.3 兼容性验收

| 检查 | 通过条件 |
|---|---|
| `/apiv2/` 所有端点行为不变 | `docs/workflow/run_analysis.sh` 在 SPA 上线前后输出一致 |
| Django admin 可用 | 现有运维流程不变 |
| allauth 全部流程可用 | 注册 / 登录 / 邮件确认 / 2FA / OAuth 4 个 provider / 密码重置 / captcha 全部回归通过 |
| `agent.py` 协议无改动 | `git diff` 显示 0 修改 |
| 数据 schema 无改动 | Postgres 没新 migration（除 web 自己的 admin / token 表）；Mongo 字段路径无改 |

---

## 附录 A：Decision Log

完整 28 项决策。

| # | 决策 | 选项 | 选定 | 理由 |
|---|---|---|---|---|
| D-01 | 重构总策略 | 单进程并存 / 独立部署 / 跨域 | **独立部署** | 真正前后端分离语义；同源避开 CORS；前端可独立发版 |
| D-02 | API 演进 | 替换 v2 / v2+v3 并存 / 立即下线 v2 | **v2+v3 并存，v2 永驻** | 不破坏现有客户端 |
| D-03 | 代码组织 | monorepo / 双仓库 | **monorepo** | 单人维护，集中管理 |
| D-04 | 镜像 | 合一 / 分离 | **两镜像** | 前后端独立发版 |
| D-05 | 前端框架 | React / Vue / Svelte | **React 18 + TS** | 数据可视化生态最强；招人最容易 |
| D-06 | 构建工具 | Vite / Webpack / Next.js | **Vite** | SPA 不需 SSR；HMR 快 |
| D-07 | UI 库 | shadcn / MUI / Ant / Mantine | **shadcn/ui + Tailwind v4** | 复制源码可深度定制；与设计稿 tokens 匹配 |
| D-08 | 数据获取 | TanStack Query / SWR / RTK Query | **TanStack Query v5** | 缓存/失效自动；与 SSE 配合好 |
| D-09 | 路由 | React Router 7 / TanStack Router | **React Router 7** | 生态成熟、文档全 |
| D-10 | 鉴权 | Session+CSRF / Token+v3 / JWT | **Session+CSRF（方案 A）** | allauth 零改造继承；同源天然适配 |
| D-11 | token_auth_enabled | yes / no | **yes（强制）** | 修复 v2 默认裸跑安全隐患 |
| D-12 | 实时推送 | SSE / WebSocket / 轮询 | **SSE 优先** | 单向场景简单可靠 |
| D-12.1 | SSE 鉴权 | Session-only / token query / polyfill / WS | **Session-only** | 浏览器 EventSource 限制；token 客户端继续轮询 |
| D-13 | OpenAPI | 自动 / 手写 / 不做 | **drf-spectacular 自动**（仅 v3） | 数据契约一致性 |
| D-14 | 数据契约 | 重新设计 / 锁定 data.js | **锁定 data.js shape** | 前后端字段名免争议 |
| D-15 | 样式 tokens | shadcn 默认 / 设计稿 styles.css | **复用设计稿 tokens** | 设计稿已是事实标准 |
| D-16 | 服务层 | 视图直读 ORM / 抽 service | **抽 service**（v3 强制，v2 渐进） | 跨 DB 一致性、可测性 |
| D-17 | RBAC | 沿用 / 扩展 | **沿用** staff/superuser + UserProfile | 完全保功能即可 |
| D-18 | 设计画布工具 | 进生产 / 不进 | **不进生产** | `design-canvas.jsx`、`tweaks-panel.jsx`、Babel-standalone 仅设计预览 |
| D-19 | 前端代码位置 | `frontend/app/` / `web-spa/` | **`frontend/app/`** | 与 `frontend/web-design/` 同根 |
| D-20 | API Docs 入口 | 跳老 `/apiv2/` 自查页 / SPA 内嵌 viewer | **SPA 内嵌 Swagger UI** | 风格统一、消费 spectacular schema |
| D-21 | HTTPS | 强制 / 建议 | **建议**（生产推荐，内网可 HTTP） | 内部部署灵活性 |
| D-22 | Configs 页 | P0 / P1 / OUT | **P1**（保留路由 stub） | 设计已画但 MVP 不实现 |
| D-23 | ATT&CK tab | P0 新端点 / P1 / 复用现有 | **P0** + 新建 `/api/v3/reports/<id>/attack/` | 设计独立 tab，需结构化 TTP |
| D-24 | Audit 视图 | P0 / P1 / OUT | **P0**（设计稿外补简单页） | 内部分析师常用 |
| D-25 | 浏览器支持 | 多版本 / 最新两版 | **最新 2 版** Chrome/Edge/Firefox | 内部统一好控 |
| D-26 | i18n | 单语 / 双语 | **英文 + 简体中文** | 上游英文 / 团队中文 |
| D-27 | 报告页可视化主库 | React Flow / Cytoscape / vis-network / D3 | **React Flow + Recharts + D3 兜底** | React-idiomatic、TS 一流、bundle 适中 |
| D-28 | 自动布局算法 | dagre / elkjs / 手动 | **dagre 默认**，复杂场景 elkjs | 业界标配，与 React Flow 配套例子多 |

---

## 附录 B：Assumptions

### B.1 数据与契约

- 不动 Postgres / Mongo / Elasticsearch schema
- 不动 `agent.py` 协议、`storage/` 布局、`conf/` 体系
- v3 端点的 JSON shape 以 `frontend/web-design/data.js` 为准（扁平字段名）
- v3 强制走 DRF Serializer + drf-spectacular

### B.2 前端工程

- TypeScript 严格模式
- 状态管理：TanStack Query（服务端） + Zustand（本地 UI）；不引入 Redux
- 表单：react-hook-form + zod
- HTTP 层：axios + interceptor（统一 CSRF + 错误处理）
- 路由：React Router 7（`createBrowserRouter`）
- 样式：Tailwind v4 + shadcn/ui，CSS tokens 从设计稿迁
- 测试：Vitest + Playwright
- Linting：ESLint + Prettier + typescript-eslint
- 设计稿 `design-canvas.jsx`、`tweaks-panel.jsx`、Babel-standalone HTML 不进生产

### B.3 后端工程

- 后端不更换框架（仍 Django + DRF + uwsgi，daphne 仅 SSE）
- v2 视图业务逻辑后续逐步迁移到 `web/services/`，**URL/响应不变**
- v3 视图禁止直接读 Mongo
- `/admin/` 与 `/accounts/*` 保持 Django 渲染，不改造
- `web/permissions.py` 整合 TLP / 速率限制 / api.conf gate

### B.4 部署与运维

- 同一 nginx 入口，按路径前缀代理
- 两个独立 Docker 镜像（cape-web + cape-spa）
- monorepo：`frontend/app/`（前端）+ 现有 `web/` 不变
- HTTPS 在生产建议但不强制
- 不引入新监控告警

### B.5 鉴权

- SPA 默认路径：未登录跳 `/accounts/login/`
- 浏览器 fetch 全部 `credentials: "include"`
- CSRF token 通过 `/api/v3/auth/csrf/` 获取
- `[api] token_auth_enabled = yes` 强制开
- 程序化客户端继续用 token；SPA 用 session

### B.6 范围与节奏

- 全程对照 P0 清单，每月 milestone 评审
- 设计图未到位时先做 API/服务层
- 超过 6 个月仍未完成 → 砍 P1
- v2 永远保留

---

## 附录 C：术语表

| 术语 | 含义 |
|---|---|
| **SSR** | Server-Side Rendering，Django 模板渲染 |
| **SPA** | Single Page Application，本次新建的 React 工程 |
| **DRF** | Django REST Framework |
| **allauth** | django-allauth，CAPE 用的鉴权框架 |
| **TLP** | Traffic Light Protocol，CAPE 的样本敏感级别（white/green/amber/red） |
| **SSE** | Server-Sent Events，HTTP 单向推送协议 |
| **TTP** | MITRE ATT&CK 中的 Tactics/Techniques/Procedures |
| **agent** | VM 内的 HTTP 服务，CAPE 主进程通过它驱动 guest |
| **rooter** | `utils/rooter.py`，root 权限的网络路由控制进程 |
| **resultserver** | `lib/cuckoo/core/resultserver.py`，接收 VM 回传日志的服务 |
| **machinery** | `modules/machinery/`，CAPE 的虚拟化抽象层 |
| **gating** | `api.conf` 中每个端点的 `enabled = yes/no` 开关机制 |
| **strangler fig** | 渐进式重构模式，新代码逐步替换旧代码而不是一次性重写 |

---

**文档结束。**
