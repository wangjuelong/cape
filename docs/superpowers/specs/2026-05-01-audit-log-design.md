# Audit Log 浏览 — 设计

**Date:** 2026-05-01
**Topic:** 在 SPA 导航栏 Audit 下提供审计日志浏览
**Branch target:** `refactor/web-spa`
**Replaces:** `frontend/app/src/routes/audit.tsx` 当前的 StubPage
**Status:** Approved (2026-05-01) — handoff to writing-plans

---

## 0. 背景

SPA `/audit` 当前是 StubPage，只列了 TODO（`GET /api/v3/audits/...`、按 user/action/target 过滤）。CAPE 后端**没有**用户操作审计基础设施 — 没有 audit 表、没有事件记录 middleware、`tasks` 表只有任务态而非"谁动过"事件。Django `audit/` app 实际是测试套件管理（TestSession/TestRun），与"审计日志"语义不同。

本 feature 从 0 建审计日志能力。

## 1. 目标 & Scope

**主用户**：安全审计员 — 关心"谁、何时、对哪个对象做了什么"+ 留痕完整。

**Phase 1 跟踪事件类**：
- **a. 认证事件** — login(success/failed)、logout、password_change、password_reset_request、signup
- **f. 用户管理** — ban_user、unban_user、Django admin 改用户配置（is_active/is_staff/subscription 等）

**Phase 2（后续，不在此 spec）**：
- b. 任务破坏性操作（delete / reschedule / reprocess）— 等任务功能完整后接入
- d. 配置变更（conf/*.conf 改动）— 视后续需要决定接入方式

**非目标**：
- 硬留痕 / 链式 hash 篡改检测（留给 phase 3）
- 外部 sink（syslog / Splunk）
- CSV 导出
- 实时 SSE 推送
- Audit 角色分级

## 2. 关键决策

| 维度 | 决策 |
|---|---|
| 主用户 | 安全审计员（A） |
| 事件 | Phase 1 = 认证 + 用户管理 |
| 留痕强度 | 软留痕 — 应用层 append-only，90 天滚动 prune（I） |
| 列表样式 | 紧凑表格 + 多列 filter（A） |
| 实时性 | 静态查询 + Refresh 按钮（a） |
| 导出 | 不做 |
| 捕获方式 | 方案 2 — allauth 信号 + Django LogEntry 桥接 + 用户管理视图显式调用 |

## 3. 架构总览

```
                       ┌─────────────────┐
                       │  allauth signals│
                       │  user_logged_in │
                       │  password_set …  │  (auth 自动)
                       └────────┬────────┘
                                │
   ┌────────────────────┐       │       ┌────────────────────────┐
   │  view: ban_user    │       │       │ admin LogEntry post_save│
   │  view: change_sub  ├───────┤       │ (Django admin 操作桥接)  │
   │  audit.log(...)    │       │       └────────┬────────────────┘
   └────────────────────┘       │                │
                                ▼                ▼
                          ┌─────────────────────────────┐
                          │ audit.log() helper          │
                          │ — 唯一 INSERT 入口           │
                          │ — 失败静默 + log.exception   │
                          └────────────┬────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────────┐
                          │  Postgres: audit_events     │
                          │  app-level append-only      │
                          │  90d TTL (cron prune)       │
                          └────────────┬────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────────┐
                          │  GET /api/v3/audits/         │
                          │  cursor pagination + filters│
                          └────────────┬────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────────┐
                          │  SPA /audit                 │
                          │  紧凑表格 + 多列过滤        │
                          └─────────────────────────────┘
```

新增模块：
- `web/audit_log/` 独立 Django app（`models.py` + `helpers.py` + `signals.py`）
- `web/apiv3/views.py` 新视图 + `urls.py` 新路由
- `frontend/app/src/routes/audit.tsx` 替换 StubPage + 一组 audit 子组件
- `utils/audit_prune.py` + systemd timer

**Database 选址**：`audit_events` 表落在 **`siteauth.sqlite`（Django default DB）**，而非 cape PostgreSQL。理由：
- Django `auth_user` 表在 siteauth.sqlite，audit 行需要引用 user.id 才能连关系；跨 DB FK 在 Django/SQLAlchemy 都做不了
- 信号 / LogEntry 桥接全在 Django ORM 层，同库省一层路由
- Phase 1 写量低（认证 + 用户管理事件 ~ 100/day），SQLite 单写入 connection 完全够；担心并发的话可后续 swap 到 PostgreSQL（schema 不变）
- Migration 用 Django `makemigrations` / `migrate`，不动 Alembic（Alembic 在 cape PostgreSQL 上）

## 4. 数据模型

### 4.1 `audit_events` 表（Django ORM model on siteauth.sqlite）

实际由 Django `makemigrations` 生成 SQLite DDL；下面是逻辑 schema（**注意不再有 FK** — `actor_user_id` 是裸整数 + snapshot username 兜底，跨场景都 OK）：

```python
# web/audit_log/models.py
class AuditEvent(models.Model):
    id              = models.BigAutoField(primary_key=True)
    timestamp       = models.DateTimeField(default=timezone.now, db_index=True)

    # 谁做的（actor 可能是匿名 / 失败登录场景 → nullable）
    actor_user_id   = models.IntegerField(null=True, blank=True)   # 裸整数, 不加 FK (跨库不行 + 用户被删后仍要保留行)
    actor_username  = models.CharField(max_length=150, null=True, blank=True)
    actor_ip        = models.GenericIPAddressField(null=True, blank=True)
    actor_user_agent = models.TextField(null=True, blank=True)

    # 做了什么
    action          = models.CharField(max_length=64)
    success         = models.BooleanField(default=True)

    # 对谁做
    target_type     = models.CharField(max_length=32, null=True, blank=True)
    target_id       = models.CharField(max_length=64, null=True, blank=True)
    target_label    = models.CharField(max_length=255, null=True, blank=True)

    # action 特定字段
    metadata        = models.JSONField(default=dict)

    class Meta:
        db_table = "audit_events"
        indexes = [
            models.Index(fields=["-timestamp"]),                              # 主排序
            models.Index(fields=["actor_user_id", "-timestamp"]),
            models.Index(fields=["target_type", "target_id", "-timestamp"]),
            models.Index(fields=["action", "-timestamp"]),
        ]
```

`models.JSONField` 在 SQLite ≥ 3.9 受 Django 原生支持。query 时用 `__contains` / `__has_key` lookup。

### 4.2 Phase 1 `action` 取值（11 个）

| action | success | target_type | metadata 字段 |
|---|---|---|---|
| `login_success` | true | `user`(actor) | — |
| `login_failed` | false | NULL | `attempted_username`, `reason` |
| `logout` | true | `user`(actor) | — |
| `password_change` | true | `user` | — |
| `password_reset_request` | true | `user` | `email` |
| `signup` | true | `user` | — |
| `ban_user` | true | `user` | `reason` (可选) |
| `unban_user` | true | `user` | — |
| `admin_addition` | true | (LogEntry.content_type) | `change_message` |
| `admin_change` | true | (LogEntry.content_type) | `change_message` |
| `admin_deletion` | true | (LogEntry.content_type) | `change_message` |

### 4.3 写入约束（应用层 append-only）

- 所有 INSERT 必须经 `audit_log/helpers.py:log()`
- 模块**不导出** model 的可改实例（无 `.save()` / `.delete()` 出口给业务代码）
- DB 层不加触发器（"软留痕"决定），只靠代码约定 + `grep` 审计
- 唯一允许的 DELETE 路径是 `utils/audit_prune.py`，systemd timer 每天 03:00 跑：
  ```python
  # 用 Django ORM, 不用 raw SQL
  AuditEvent.objects.filter(timestamp__lt=timezone.now() - timedelta(days=90)).delete()
  ```

### 4.4 Snapshot 字段

`actor_username` / `target_label` 是 snapshot（非外键），原账号被删后仍可读 — 审计完整性不依赖外键存在。

## 5. 捕获流程

### 5.1 公共 Helper

`web/audit_log/helpers.py`：

```python
def log(
    action: str,
    *,
    request=None,                  # 自动取 actor / IP / UA
    actor: User | None = None,     # 显式覆盖（信号场景常用）
    target_type: str | None = None,
    target_id: str | int | None = None,
    target_label: str | None = None,
    success: bool = True,
    **metadata,
) -> None:
    """唯一允许写 audit_events 的入口. 失败静默 + log.exception 而不是
    向上抛 — 审计写失败绝不能让原业务请求 500."""
```

约束：
- **never raise** — 异常吞掉 + journal `log.exception(...)`
- actor / IP / UA 取值优先级：显式 `actor=` 参数 > `request.user / request.META`；request 也未给 → 全部为 `NULL`（合法，匿名失败登录场景）
- 写完不返回 model 实例（避免误改）
- metadata key 名命中 `password|token|secret|cookie|authorization` 的（case-insensitive 子串匹配），值替换为 `"[REDACTED]"`
- 不可序列化 metadata 值用 `json.dumps(default=str)` 兜底

### 5.2 allauth 信号（认证）

`web/audit_log/signals.py` 接 6 个：
- `allauth.account.signals.user_logged_in` → `login_success`
- `django.contrib.auth.signals.user_login_failed` → `login_failed`
- `allauth.account.signals.user_logged_out` → `logout`
- `allauth.account.signals.user_signed_up` → `signup`
- `allauth.account.signals.password_changed` / `password_set` → `password_change`
- `allauth.account.signals.password_reset` → `password_reset_request`

### 5.3 Django admin LogEntry 桥接

`@receiver(post_save, sender=LogEntry)` 把每条 admin 操作映射到 `admin_addition / admin_change / admin_deletion` action，`content_type.model` 进 `target_type`，`change_message` 进 metadata。

这样不必单独 hook 每个 admin 模型 —— Django 已经统一记到 LogEntry 了。

### 5.4 显式调用（用户管理）

视图层加一行：

```python
# web/analysis/views.py: ban_user
def ban_user(request, user_id):
    target = User.objects.get(pk=user_id)
    target.is_active = False
    target.save()
    audit.log("ban_user", request=request,
              target_type="user", target_id=target.id,
              target_label=f"user:{target.username}",
              reason=request.POST.get("reason", ""))
    return ...
```

Phase 1 涉及视图：`ban_user`、`ban_user_tasks`（共 2 个；`unban_user` 当前没视图实现，由 admin LogEntry 桥接覆盖）。

## 6. apiv3 端点

### 6.1 路由

```
GET  /api/v3/audits/                 列表 + filter + cursor 分页
GET  /api/v3/audits/actions/         action 取值集（给 SPA 填 filter 下拉）
```

### 6.2 鉴权

`@permission_classes([IsAdminUser])` — 必须 `is_staff=True`。普通登录用户访问 → 403。

### 6.3 列表 query 参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `cursor` | str | 上一页 `next_cursor` |
| `limit` | int | 默认 50，最大 200 |
| `actor` | str | actor_username 精确匹配 |
| `action` | str | action 精确匹配（多值用逗号）|
| `target_user` | str | 在 `target_type='user'` 行里匹配：值为纯数字 → 按 `target_id` 精确匹配；非数字 → 按 `target_label` 精确匹配（e.g. `user:bob`）|
| `target_type` | str | `user` / `task` / `machine` |
| `success` | bool | 只看成功 / 失败 |
| `since` / `until` | ISO8601 | 时间窗 |
| `q` | str | actor_username / target_label / metadata ILIKE 兜底 |

### 6.4 列表响应

```jsonc
{
  "data": [
    {
      "id": 1234,
      "timestamp": "2026-05-01T12:34:21Z",
      "actor": {"user_id": 5, "username": "admin", "ip": "192.168.1.5", "user_agent": "Mozilla/..."},
      "action": "ban_user",
      "success": true,
      "target": {"type": "user", "id": "7", "label": "user:bob"},
      "metadata": {"reason": "spam"}
    }
  ],
  "next_cursor": "1186"
}
```

### 6.5 actions 响应

```json
{
  "data": [
    {"value": "login_success", "label": "Login Success", "category": "auth"},
    {"value": "login_failed", "label": "Login Failed", "category": "auth"},
    {"value": "logout", "label": "Logout", "category": "auth"},
    {"value": "password_change", "label": "Password Change", "category": "auth"},
    {"value": "password_reset_request", "label": "Password Reset Request", "category": "auth"},
    {"value": "signup", "label": "Sign Up", "category": "auth"},
    {"value": "ban_user", "label": "Ban User", "category": "user_mgmt"},
    {"value": "unban_user", "label": "Unban User", "category": "user_mgmt"},
    {"value": "admin_addition", "label": "Admin: Created", "category": "admin"},
    {"value": "admin_change", "label": "Admin: Changed", "category": "admin"},
    {"value": "admin_deletion", "label": "Admin: Deleted", "category": "admin"}
  ]
}
```

### 6.6 OpenAPI

drf-spectacular 自动登记到 `/api/v3/schema/`。无 `/api/v3/legacy/audits/` 镜像 — 审计是全新功能，无老 token 客户端依赖。

## 7. 前端 SPA

### 7.1 文件结构

```
frontend/app/src/
├── routes/audit.tsx                       (主页)
├── components/audit/
│   ├── AuditFilterBar.tsx
│   ├── AuditTable.tsx
│   ├── AuditRow.tsx
│   └── ActionBadge.tsx
├── hooks/useAuditEvents.ts                (TanStack Query useInfiniteQuery)
├── hooks/useAuditActions.ts
└── lib/api/audits.ts
```

### 7.2 紧凑表格布局

- 顶部 filter bar：Date range / Actor / Action multi-select / Target user / success-only toggle / Apply / Clear
- 表格列：Time（相对时间，hover 显示 ISO） / Actor / Action（着色 chip） / Target / IP / 展开图标
- 单击行内展开 metadata 详情（不开 side panel）
- 底部翻页：`prev` / cursor 显示 / `next`

### 7.3 状态

- loading: `<Spinner>`
- error: Alert + Retry
- empty (no filter): "No audit events recorded yet."
- empty (with filter): "No events match these filters." + Clear filters
- 403 (非 staff): AdminGate Alert "Admin privileges required to view audit log."

### 7.4 URL state

filter 全部进 query string：`/audit?action=login_failed&since=2026-04-25&actor=admin`。
- 链接可分享
- 浏览器后退工作
- `?event=1186` 直链定位 + 自动展开那行 metadata

### 7.5 Action chip 着色

| category | color |
|---|---|
| `auth` (success) | 绿 |
| `auth` (failed) | 红 |
| `user_mgmt` | 黄 |
| `admin` | 紫 |

### 7.6 复用的 SPA 设施

- `<PageHead>` / `<Alert>` / `<Spinner>` / `<Badge>` 现有组件
- `table.data` CSS class 与 Recent / Search 同
- `useCurrentUser()` 检 `is_staff`
- Sidebar nav item 已存在（`/audit` in ADMIN 区），不加 `flag` —— 路由本身 staff-only，匿名跳登录、普通用户看 AdminGate

## 8. 错误处理 / 安全

### 8.1 写入失败

- DB 不可达 / 表不存在 → 吞 + journal `log.exception(...)`，业务请求继续
- 信号 handler 异常 → 单独 try/except 包每个 receiver
- metadata 序列化失败 → `json.dumps(default=str)`

### 8.2 鉴权 3 层

1. Django：`@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)`
2. DRF：`@permission_classes([IsAdminUser])`
3. SPA：`useCurrentUser().is_staff` AdminGate

### 8.3 PII / 敏感数据

- IP / UA 不脱敏（取证必需）
- 不记录密码 / token / cookie / authorization header（helper 白名单 + 关键词 redact）
- 攻击者注册的恶意账号名由 React 自动转义渲染

### 8.4 注入面

- SPA 全文本节点渲染（无 dangerouslySetInnerHTML）
- ORM 全参数化（`__icontains` 不拼字符串）
- 无 raw SQL

### 8.5 限速

复用 DRF 全局 throttle，不加 endpoint 专属 section。

### 8.6 边界

| 场景 | 行为 |
|---|---|
| Actor 用户被删 | snapshot 字段仍可读 |
| Target 用户被删 | 同上 |
| 同秒多事件 | id 自增保单调 |
| 时区 | DB UTC，SPA 浏览器本地 |
| Prune 中断 | DELETE 幂等，下次再跑 |
| 表损坏 | 不降级业务，监控告警人工介入 |

## 9. 测试

按 `~/.claude/rules/common/testing.md` 三档，目标 80%+ 覆盖。

### 9.1 Backend Unit (`tests/test_audit_log_helpers.py`)

| 测试 | 断言 |
|---|---|
| `log("login_success", ...)` 成功写一行 | DB 出现，actor / IP / UA 正确 |
| DB 不可达时 `log()` 不抛异常 | mock outage; journal 有 traceback |
| metadata 字段名匹配关键词 → 值 redact | `metadata == {"password": "[REDACTED]"}` |
| `actor_username` 是 snapshot | 删 user 后 audit 行仍可读 |
| 不可序列化 metadata 兜底 | datetime / Decimal 不抛 |
| `log()` 不返回可写 model 实例 | grep .save / .delete 不在调用方代码 |

### 9.2 Backend Integration (`tests/test_audit_log_signals.py`)

| 测试 | 断言 |
|---|---|
| `client.login(...)` 成功 | `audit_events` 新增 `action=login_success` |
| 错误密码登录 | `action=login_failed` `success=False` `attempted_username` 对 |
| logout / signup / password_change | 各自 action 写入 |
| `ban_user` POST | action / target_label / reason 对 |
| Admin /admin/auth/user/N/change/ 改 is_active | LogEntry 桥接 → admin_change 写入 |

### 9.3 Backend Prune (`tests/test_audit_log_prune.py`)

| 测试 | 断言 |
|---|---|
| `audit_prune.py` 删 timestamp < NOW()-90d | 91 天前删，89 天前留 |
| Prune 是唯一 DELETE 路径 | grep audit_log/* 无 DELETE |

### 9.4 apiv3 Endpoint (`tests/test_apiv3_audits.py`)

| 测试 | 断言 |
|---|---|
| 匿名 GET | 401 |
| 普通用户 (non-staff) | 403 |
| Staff 默认 | 200，timestamp DESC，最近 50 |
| `?action=login_failed` | 只返 login_failed |
| `?actor=admin` | 只返 actor=admin |
| `?since/?until` | 时间窗对 |
| `?limit=10` + `cursor` 翻页 | 第二页 11-20，cursor 正确对接 |
| `/actions/` | 11 个 action 全列出 + category 正确 |

### 9.5 Frontend E2E (`tests/e2e/audit-log.spec.mjs`)

跑在 192.168.1.6:

| 测试 | 断言 |
|---|---|
| 匿名 GET `/audit` | 302 → /accounts/login/?next=/audit |
| 非 staff 登录后 | AdminGate Alert，无表格 |
| Staff (admin) 登录后 | 表格渲染，列头全在，至少 1 行 |
| filter `action=login_success` | 表格只剩 login_success |
| 点行展开 | metadata 显示，再点折叠 |
| URL state `?action=...&actor=...` | filter 自动激活 |
| 点 Refresh | spinner + 重新请求 |

### 9.6 测试 fixture

`tests/conftest.py` 补：
- `make_audit_event(action, actor=..., target=...)` factory
- `seed_audit_events(N)` 批量造事件用于翻页测试

### 9.7 不测试的（YAGNI）

- 性能基准（90d ≤ 2k 行）
- 并发写竞态（自增 PK + 行锁）
- i18n（CAPE 英文 only）

## 10. Phase 2 接入路径

待 b（任务破坏性操作）和 d（admin 配置变更）功能完整后追加，**不改本设计的任何部分**：

- **b**：在 apiv3 现有 `task_delete / tasks_resubmit` 视图末尾加 `audit.log("task_delete", ...)`
- **d**：phase 1 的 LogEntry 桥接已经覆盖 `/admin/` 内变更；conf/*.conf 的文件级改动留给后续讨论

不变量：phase 1 的存储 + helper API + apiv3 端点 + SPA 表格 全部可复用；phase 2 只新增 action 值 + 新视图调 helper。

## 11. 实施工单（粗粒度，给 writing-plans 拆细）

| # | 模块 | 大致 |
|---|---|---|
| W1 | Django app `web/audit_log/` 骨架 + INSTALLED_APPS | S |
| W2 | Django migration `audit_events` + 4 个 index (`makemigrations audit_log` + `migrate`) | S |
| W3 | `helpers.py` `audit.log()` + redaction + try/except | M |
| W4 | `signals.py` 6 个 allauth/auth handler | M |
| W5 | LogEntry post_save 桥接 | S |
| W6 | `analysis/views.py` ban_user / ban_user_tasks 加 audit.log() | S |
| W7 | `utils/audit_prune.py` + `cape-audit-prune.timer` systemd unit | S |
| W8 | apiv3 list + actions 视图 + serializers + urls.py | M |
| W9 | apiv3 legacy 不需要镜像 | — |
| W10 | 前端 `lib/api/audits.ts` + types | S |
| W11 | 前端 hooks (`useAuditEvents` / `useAuditActions`) | S |
| W12 | 前端 audit 子组件 | M |
| W13 | 前端 `routes/audit.tsx` 替换 + AdminGate + URL state | M |
| W14 | 后端 unit + integration + prune tests | M |
| W15 | apiv3 endpoint tests | M |
| W16 | 前端 e2e tests | M |
| W17 | docs/web/audit-log.md + 更新 docs/web/api-reference.md | S |
| W18 | 192.168.1.6 部署 + 实跑验证 | M |

S = ≤30min / M = ≤2h / 总 18-20 小时

## 12. 不在此 spec（YAGNI）

- 硬留痕 / 链式 hash
- 外部 sink (syslog / Splunk)
- CSV / JSONL 导出
- SSE 实时推送
- Audit 角色分级（read-only auditor）
- conf/*.conf 文件级 audit
- 性能基准

## 13. 参考

- `~/.claude/rules/common/testing.md` — 测试覆盖率 80% + 三档
- `~/.claude/rules/common/security.md` — 输入校验、PII、注入面
- `docs/web/api-reference.md` — apiv3 端点风格、cursor 分页约定
- 现有 SPA 风格参考：`frontend/app/src/routes/{recent,search}.tsx`
