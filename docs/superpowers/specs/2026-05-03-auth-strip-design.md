# Sub-spec #1 — Auth Strip 设计 (Authentication Surface Reduction)

**Status:** approved-pending-spec-review
**Date:** 2026-05-03
**Branch:** refactor/web-spa
**Implementation route:** A — URL surgery + admin unregister + 模板/settings 清理（不动 `INSTALLED_APPS`）

---

## 1. Understanding Summary

- **目标**：本部署转为"纯单租户内网 sandbox"模式，认证体面从开放 SaaS 风格（社交登录、邮件验证、自助注册、2FA framework、密码重置邮件）瘦身为唯一一种 —— **用户名 + 密码登录**。API 调用方走 `/apiv2/*` 的 DRF Token 仍然保留。
- **谁用**：内部沙箱用户，由 admin 在 SPA `/users` 创建；忘记密码 → 找 admin。无第三方 / 公网消费者。
- **范围**：URL surgery（合掉 allauth `accounts/` 大部分入口）+ Django admin 解绑（User / Group / Token / EmailAddress / SocialAccount 全部 unregister）+ 模板 / settings / conf 文件 cleanup。**不卸载** `INSTALLED_APPS` 中的 `allauth.socialaccount`，迁移历史 + 表保留以保证可逆。
- **关键约束**：
  - 完全 reversible — 一句 `git revert` 即可恢复原 allauth.urls include + admin register。
  - apiv2 token API（沙箱检测）零变化。
  - SPA 已有的所有功能（audit-log / submit / users / docs / etc.）零回归。
- **明确非目标**：
  - 不卸载 allauth 框架（路线 B）
  - 不删 DB 表 / 迁移
  - 不加 LDAP / SAML / OAuth
  - 不做 SCIM / external-user-provisioning
  - 不重新引入 self-service signup
  - 不为本部署加邮件发送（SMTP 配置保留但无触发器）

## 2. Assumptions

1. `/api/v3/*` token 认证保留（与 `/apiv2/*` 同；实现成本零）。
2. allauth.account 框架保留 — 用户名密码登录走它的 `LoginView` / `LogoutView`。
3. allauth.socialaccount 留在 `INSTALLED_APPS` 但 0 流量；DB 表 idle。
4. Django admin 主体框架保留 — `/admin/` 仍可登录，看到 sites、django_recaptcha 等其它 model；只是 User/Group/Token/Email/Social 7 个 model 不再注册。
5. SMTP `EMAIL_BACKEND` 设置保留（多数部署默认 console / dummy；不浪费配置）；本次没有任何代码触发邮件发送。
6. 用户 `password reset` 流（忘记密码）通过管理员 `/users/<id>/Set password` 解决；产品上接受这个 trade-off。
7. 现有 SPA 头像下拉的 "Change password" 走 `/api/v3/me/password/`（已在 `2026-05-02-user-management` spec 实现，已上线）—— 本次不动它。

## 3. 架构 / 影响面

```
保留 endpoints:
  /accounts/login/                 allauth username+password
  /accounts/logout/                allauth logout
  /admin/                          Django admin (其它 model 仍可访问)
  /api/v3/*                        SPA + 第三方 (session + Token 两种 auth)
  /apiv2/*                         third-party token API (Token auth 必填)

下线 endpoints (404):
  /accounts/signup/
  /accounts/email/
  /accounts/password/change/
  /accounts/password/reset/
  /accounts/password/reset/done/
  /accounts/password/reset/key/<key>/
  /accounts/password/reset/key/done/
  /accounts/confirm-email/<key>/
  /accounts/social/* (任何子路径)

  /admin/auth/user/
  /admin/auth/group/
  /admin/authtoken/tokenproxy/
  /admin/account/emailaddress/
  /admin/socialaccount/socialaccount/
  /admin/socialaccount/socialapp/
  /admin/socialaccount/socialtoken/
```

## 4. 后端改动

### 4.1 URL surgery — `web/web/urls.py`

**Before**:
```python
urlpatterns = [
    ...
    path("accounts/", include("allauth.urls")),
    ...
]
```

**After**:
```python
from allauth.account.views import LoginView, LogoutView

urlpatterns = [
    ...
    # accounts/ — username/password only (was include("allauth.urls"))
    # Selective exposure: only login + logout. signup / email / password reset /
    # social / 2FA all 404. Admin creates users via SPA /users; forgotten
    # passwords reset via SPA /users/<id>/Set-password.
    path("accounts/login/", LoginView.as_view(), name="account_login"),
    path("accounts/logout/", LogoutView.as_view(), name="account_logout"),
    ...
]
```

**关键**：URL name `account_login` / `account_logout` 必须保留 — `LOGIN_URL` setting + `@login_required` redirect target + middleware 内部多处用 `reverse('account_login')`。

**Sub-step 4.1.1**：grep 整个仓库确认 `account_login` / `account_logout` 仅在保留位置使用，无其它对 allauth signup/email/reset 的 URL name reverse() 引用。如有 → 清理。

### 4.2 Admin unregister — 重写 `web/users/admin.py`

```python
"""SPA owns all auth/token UI. Unregister User/Group/Token/EmailAddress/
SocialAccount from Django admin so /admin/auth/user/, /admin/auth/group/,
/admin/authtoken/, /admin/account/emailaddress/, /admin/socialaccount/*
return 404 — auth lives in /users (SPA)."""

from contextlib import suppress

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialApp, SocialToken
from django.contrib import admin
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import TokenProxy

for model in (User, Group, TokenProxy, EmailAddress, SocialAccount, SocialApp, SocialToken):
    with suppress(admin.sites.NotRegistered):
        admin.site.unregister(model)
```

**删除**：原文件中的 `CustomUserAdmin`、`ProfileInline`、`make_active`、`make_deactivated` 全部移除（SPA 已替代功能）。

**保留**：`web/users/models.py` 中的 `UserProfile` 模型 + post_save signal + migrations（apiv3 endpoints 在用）。

### 4.3 Settings / conf 清理 — `web/web/settings.py`

**删除以下行 + 任何引用**：

```python
TWOFA = web_cfg.web_auth.get("2fa", False)
```
+ 任何 `if settings.TWOFA:` 分支（`web/web/urls.py` 顶部 + admin.site.__class__ 处理）

```python
if web_cfg.registration.get("captcha_enabled", False):
    ACCOUNT_SIGNUP_FORM_CLASS = "web.allauth_forms.CaptchedSignUpForm"
    # ... and recaptcha key blocks
```

注释掉的 `'django_otp', 'django_otp.plugins.otp_totp'` 与相关 import。

**保留**：
```python
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
ACCOUNT_AUTHENTICATION_METHOD = "username"  # 或现有值
ACCOUNT_EMAIL_REQUIRED = False
AUTHENTICATION_BACKENDS = [..., "allauth.account.auth_backends.AuthenticationBackend"]
```

### 4.4 Conf 文件清理

`conf/default/web.conf.default`：
- `[web_auth]` 下移除 `2fa = no` (or whatever) 行
- `[registration]` 下移除 `captcha_enabled = no` 行 (如存在)

## 5. 前端改动

### 5.1 模板删除

**保留** (3 个)：
```
web/templates/account/login.html
web/templates/account/logout.html
web/templates/account/_auth_layout.html  (login.html 的 extends 父)
```

**删除** (12 个)：
```
web/templates/account/{signup,signup_closed,email,email_confirm,
                       password_change,password_reset,password_reset_done,
                       password_reset_from_key,password_reset_from_key_done,
                       verification_sent,verified_email_required,
                       account_inactive}.html
```

**整目录删除**：
```
web/templates/socialaccount/
```

### 5.2 login.html 内的链接清理

`web/templates/account/login.html` 底部如有 "Don't have an account? Sign up" / "Forgot password?" 链接，**全删**。

具体 grep `web/templates/account/login.html` 中对 `account_signup` / `account_reset_password` / `socialaccount_login` 等 URL name 的引用 → 删除。

### 5.3 SPA 检查

grep `frontend/app/src/` 中对 `/accounts/signup/`、`/accounts/password/reset/`、`/accounts/email/`、`/accounts/social/*` 的硬编码引用 → 应该已经没有（user-management spec 已经移除），grep 二次确认。

## 6. 验证 (Verification)

### 6.1 pytest

`tests/web/test_auth_strip.py` (new)：

```python
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


def _client():
    return APIClient()


def _admin_client():
    u = User.objects.create_user(username="admin-as", password="x", is_staff=True, is_superuser=True)
    c = APIClient(); c.force_authenticate(user=u)
    return c


def assert_404(client, path):
    resp = client.get(path)
    assert resp.status_code == 404, f"{path} got {resp.status_code} (expected 404)"


@pytest.mark.django_db
def test_signup_returns_404():
    assert_404(_client(), "/accounts/signup/")


@pytest.mark.django_db
def test_email_returns_404():
    assert_404(_client(), "/accounts/email/")


@pytest.mark.django_db
def test_password_reset_returns_404():
    assert_404(_client(), "/accounts/password/reset/")


@pytest.mark.django_db
def test_password_change_returns_404():
    assert_404(_client(), "/accounts/password/change/")


@pytest.mark.django_db
def test_social_login_returns_404():
    assert_404(_client(), "/accounts/social/login/cancelled/")


@pytest.mark.django_db
def test_login_still_200():
    resp = _client().get("/accounts/login/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_logout_still_works():
    # logout via GET commonly returns 200 with confirm template,
    # or 302 if logout-on-get is disabled. We accept either non-error status.
    resp = _client().get("/accounts/logout/")
    assert resp.status_code in (200, 302, 405)


@pytest.mark.django_db
def test_admin_user_unregistered():
    assert_404(_admin_client(), "/admin/auth/user/")


@pytest.mark.django_db
def test_admin_group_unregistered():
    assert_404(_admin_client(), "/admin/auth/group/")


@pytest.mark.django_db
def test_admin_token_unregistered():
    assert_404(_admin_client(), "/admin/authtoken/tokenproxy/")


@pytest.mark.django_db
def test_admin_emailaddress_unregistered():
    assert_404(_admin_client(), "/admin/account/emailaddress/")


@pytest.mark.django_db
def test_admin_socialaccount_unregistered():
    assert_404(_admin_client(), "/admin/socialaccount/socialaccount/")


@pytest.mark.django_db
def test_url_name_account_login_resolves():
    from django.urls import reverse
    assert reverse("account_login") == "/accounts/login/"


@pytest.mark.django_db
def test_url_name_account_logout_resolves():
    from django.urls import reverse
    assert reverse("account_logout") == "/accounts/logout/"
```

### 6.2 Playwright e2e

跑现有全套（无修改）：
```
tests/e2e/audit-log.spec.mjs              3/3
tests/e2e/phase-a-network-probe.spec.mjs  1/1
tests/e2e/recent-detail-display.spec.mjs  2/2
tests/e2e/docs-page.spec.mjs              1/1
tests/e2e/account-self-service.spec.mjs   4/4
tests/e2e/users-management.spec.mjs       3/3
tests/e2e/smoke.spec.mjs                  7/7
                                          ─────
                                          21 PASS
```

零回归是 gate。任一失败 → 暂停 + diagnose。

### 6.3 手动 smoke

- `/accounts/login/` 仍能登（用 admin/cape123!）
- `/admin/` 仍可访问（admin 登录后能看到剩余 model: sites、django_recaptcha 配置等）
- `/admin/auth/user/` 应 404
- `/apiv2/cuckoo/status/` 用 token 仍 200

### 6.4 Django check

`python manage.py check` 仍 clean — 仅 pre-existing `ACCOUNT_EMAIL_REQUIRED` deprecation warning，无新错误。

## 7. 边缘 case

| Case | 处理 |
|---|---|
| `@login_required` 装饰的 view → redirect to LOGIN_URL | `/accounts/login/` 仍工作 ✓ |
| 用户在 `/accounts/email/` 等被 4xx 后期望返回错误页 | Django 默认 404 → SPA Smart404Middleware → SPA shell（与 `2026-05-02-fe-be-separation-cleanup` 一致） |
| EmailAddress 模型查询路径 | allauth 内部仍可用；不会因 admin unregister 影响 |
| 用户的 conf 设了 `2fa = yes` | settings.py 不再读取此 key → 静默忽略，不报错 |
| login.html 模板用 `{% url 'account_signup' %}` 反向 | 删除该模板内 reference → 否则 NoReverseMatch |
| 第三方代码 `from allauth.socialaccount.providers.x import ...` | 不会触发（无 provider 配置）；保险起见 grep 一遍 |
| Django admin 子模块的 history view (`admin:auth_user_history`) | 因 User 已 unregister，admin URL resolver 自动返回 404 |
| 老 user 在 EmailAddress 表里有 row | row 静态保留，不影响新流；user 改 email 通过 SPA 直接改 `User.email` |

## 8. 风险 (Risks)

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| login.html 引用 `{% url 'account_signup' %}` 之类，模板渲染 NoReverseMatch | 中 | 登录页 500 | 在 §5.2 显式 grep + 清理 |
| 用户书签了 `/accounts/password/reset/` | 低 | 该用户走不通自助重置流 | 文档明确：忘记密码联系 admin |
| 别的 Django app（非 allauth）依赖 allauth signup signal | 低 | 信号未触发但代码 path 不死 | grep `pre_signup` `user_signed_up` ；audit_log 在用 user_signed_up，但本部署没 signup 入口 → 该信号永不触发，无副作用 |
| 测试在 `force_authenticate` 后访问 `/accounts/logout/` 触发 GET-disabled | 低 | test 失败 | 测试用 `assert resp.status_code in (200, 302, 405)` |
| `allauth.socialaccount` migrations 在新部署 fresh DB 仍跑 | 低 | 表创建但 idle | 接受；零成本 |

## 9. 范围之外 (Out of Scope)

留给未来 sub-spec / 永远不做：

- **sub-spec #2**: `/groups` SPA 页面 + apiv3 group CRUD endpoints
- **sub-spec #3**: `/tokens` 顶级 admin token 列表页
- **sub-spec #4**: `/users` 完成度补齐（History tab + username 可编辑）
- 卸载 `allauth.socialaccount` from INSTALLED_APPS（路线 B）
- 删除 socialaccount / EmailAddress 表
- LDAP / SAML / OAuth provider 引入
- 自助密码重置（用户忘密码 → 必须找 admin）
- 邮件触发器（password reset email / verification email / signup confirm）
- 2FA 支持
- self-service signup

## 10. 文件清单

| Path | 状态 | 估行 |
|---|---|---|
| `web/web/urls.py` | 修改：替换 `include("allauth.urls")` 为 2 行白名单；清 TWOFA 引用 | -3/+5 |
| `web/web/settings.py` | 修改：删 TWOFA + ACCOUNT_SIGNUP_FORM_CLASS + 注释的 django_otp | -15 |
| `web/users/admin.py` | 重写：仅 7 个 unregister | -50/+18 |
| `web/templates/account/login.html` | 修改：删 signup / forgot 链接 | -10 |
| `web/templates/account/{12 files}` | 删除 | -~600 (历史模板) |
| `web/templates/socialaccount/` | 整目录删 | -~200 |
| `conf/default/web.conf.default` | 修改：删 `[web_auth] 2fa` + `[registration] captcha_enabled` 行 | -2 |
| `tests/web/test_auth_strip.py` | 新建：13 case | +120 |
| `docs/web/api-reference.md` | 修改：加"Auth surface"小节注明只剩 username+password | +20 |
| `docs/web/deploy-192.168.1.6.md` | 修改：加 sub-spec #1 部署记录 | +30 |

**总计**：~5 个修改 + 1 个新建 + 大量模板删除，**~250 行净代码改动**（不计模板删除）。

## 11. 实现顺序

```
1. 重写 web/users/admin.py (unregister 集中点)              单 commit
2. 重写 web/web/urls.py (URL surgery + 删 TWOFA 引用)       单 commit
3. 清 web/web/settings.py (TWOFA + signup form 配置)        单 commit
4. 清 conf/default/web.conf.default (2fa + captcha 行)      单 commit
5. 删 12 个 account/ 模板 + socialaccount/ 整目录            单 commit
6. 清 login.html 内的 signup / forgot 链接                   单 commit
7. tests/web/test_auth_strip.py (13 case 写 + 跑通)          单 commit
8. 部署 + e2e 全套 (zero regression gate)                    operational
9. 更新 api-reference.md + deploy-192.168.1.6.md             单 commit
```

每步独立 commit，独立可回滚。任一步骤跑测失败 → revert + diagnose。

## 12. Decision Log

| 决定 | 备选 | 理由 |
|---|---|---|
| **路线 A**（URL surgery + unregister，不动 INSTALLED_APPS） | B（移除 socialaccount）；C（保留 TWOFA flag） | A 完全 reversible，0 migration 风险，未来可加回社交登录 |
| 替换 `include("allauth.urls")` 为显式白名单 | middleware 拦截路径 | 显式更清晰，少一个间接层 |
| `web/users/admin.py` 重写为 unregister 集中点 | 在 web/web/__init__.py 或新 app 做 | users app 语义就是"用户相关 admin override"，集中合理 |
| `/accounts/password/change/` 不留 | 留作 SPA modal 故障兜底 | SPA modal 已稳定，留则是 dead surface；YAGNI |
| 保留 `EmailAddress` / `Social*` 表 + migrations | 删表 | 表不占空间；保 migration 简化未来 allauth 升级 |
| settings.py 清掉 TWOFA 而不是保留 flag | 留作未来 2FA 钩子 | YAGNI；要加回时改 5 行配置即可 |
| 不引入 password reset by admin email | 留 email-based reset | 内网部署无 SMTP；管理员现场 set password 即可 |
| 8 步 commit 切分 | 全部一个 commit | granular revert + 每步 zero-regression gate |

## 13. 跟既往 spec 的关系

- `2026-05-01-audit-log-design.md` — audit_log 已 capture login_success/_failed/logout/signup/password_change/password_reset_request 等。auth-strip 后 signup / password_reset_request 信号永不触发；audit_log ACTIONS 不删（行为：永远 0 行而已）。
- `2026-05-02-fe-be-separation-cleanup-design.md` — Smart404Middleware 已部署：SPA 路由的 404 落 SPA shell。auth-strip 删的 `/accounts/*` 子路径同样被 middleware 处理 → 返回 SPA shell + React `<NotFoundRoute>` 渲染。这反而是好事：用户书签 `/accounts/signup/` 后看到的是统一 SPA 404 页，不是 Django 默认页。
- `2026-05-02-user-management-design.md` — 自服务 modal (Edit profile / Change password / API token) 全部走 `/api/v3/me/*`，不依赖 allauth `/accounts/*` 任何 endpoint，不受本次影响。
- `2026-05-03-spa-user-management-design.md` — `/users` SPA + 19 个 apiv3 endpoint 全保留；admin User 解绑后仍能在 SPA 完成所有用户管理。
