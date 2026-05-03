# Sub-spec #1 — Auth Strip 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Django auth surface 从开放 SaaS 风格瘦身成"只剩用户名密码 + apiv2 token"。下线 allauth 自助 signup / email / password reset / social / 2FA framework；解绑 Django admin 的 User/Group/Token/EmailAddress/SocialAccount 注册；删 12+ 个无用模板。

**Architecture:** 路线 A — URL surgery（替换 `include("allauth.urls")` 为白名单）+ admin unregister + 模板/settings/conf 清理。**不动 INSTALLED_APPS**，迁移历史保留，完全 reversible。

**Tech Stack:** Django 5.1 + allauth + DRF + Playwright. Branch: `refactor/web-spa`. Spec: `docs/superpowers/specs/2026-05-03-auth-strip-design.md` (commit `cc37308b`).

---

## Common Patterns

### Remote test runner

Local has no Django; tests run on `192.168.1.6:8000` via cape user's venv. Pattern:

```bash
sshpass -p ubuntu rsync -av <files> ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/<file> /opt/CAPEv2/<dest> \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/<dest> \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest <test-path> -v 2>&1 | tail -10'
```

### Commit message format
- `refactor(<area>): <verb><object>` for code changes
- `chore(<area>): <thing>` for config / template deletions
- `test(auth): <thing>` for test-only commits
- `docs: <thing>` for docs

### TDD discipline

Each task: write failing test → run remote → confirm fail → implement → run remote → confirm pass → commit.

---

## Pre-flight

### Task 0: branch + baseline e2e

**Files:** none modified.

- [ ] **Step 1: branch state**

```bash
cd /Users/lamba/github/cape
git status
git branch --show-current
```

Expected: branch = `refactor/web-spa`, tree clean (or only this plan + spec from prior commits).

- [ ] **Step 2: baseline e2e**

```bash
cd frontend/app
PARITY_SPA_URL=http://192.168.1.6:8000 \
  SPA_LOGIN_USER=admin SPA_LOGIN_PASS='cape123!' \
  npx playwright test tests/e2e/audit-log.spec.mjs tests/e2e/account-self-service.spec.mjs --reporter=line
```

Expected: 7 passed (3 audit-log + 4 account). If pool exhausted: restart cape-web + retry.

- [ ] **Step 3: no commit needed.**

---

## Task 1: rewrite `web/users/admin.py` (centralised unregister)

**Files:**
- Modify: `web/users/admin.py` (overwrite — drop CustomUserAdmin / ProfileInline / make_active / make_deactivated; replace with 7-model unregister loop)

This is intentionally first because it has zero dependencies on URL/settings work and surfaces any allauth/DRF import issues immediately on the remote box.

- [ ] **Step 1: write failing test**

```python
# tests/web/test_auth_strip_admin.py (new)
"""Lock-in: User/Group/TokenProxy/EmailAddress/SocialAccount/SocialApp/
SocialToken are NOT registered in Django admin after auth-strip."""
import pytest

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialApp, SocialToken
from django.contrib import admin
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import TokenProxy


@pytest.mark.parametrize("model", [
    User, Group, TokenProxy, EmailAddress,
    SocialAccount, SocialApp, SocialToken,
])
def test_model_not_registered_in_admin(model):
    assert model not in admin.site._registry, (
        f"{model.__name__} is still registered in Django admin "
        "(auth-strip Task 1 should unregister it)"
    )
```

- [ ] **Step 2: run remote, expect FAIL** — most of these are still registered (User by CustomUserAdmin; Group/TokenProxy/EmailAddress/SocialAccount/SocialApp/SocialToken by their respective apps).

```bash
sshpass -p ubuntu rsync -av tests/web/test_auth_strip_admin.py ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/test_auth_strip_admin.py /opt/CAPEv2/tests/web/ \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/tests/web/test_auth_strip_admin.py \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/test_auth_strip_admin.py -v 2>&1 | tail -15'
```

- [ ] **Step 3: rewrite `web/users/admin.py` — replace entire file**

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


for _model in (User, Group, TokenProxy, EmailAddress,
               SocialAccount, SocialApp, SocialToken):
    with suppress(admin.sites.NotRegistered):
        admin.site.unregister(_model)
```

- [ ] **Step 4: deploy + rerun, expect PASS**

```bash
sshpass -p ubuntu rsync -av web/users/admin.py ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/admin.py /opt/CAPEv2/web/users/admin.py \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/web/users/admin.py \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/test_auth_strip_admin.py -v 2>&1 | tail -10'
```

Expected: 7 passed.

- [ ] **Step 5: commit**

```bash
cd /Users/lamba/github/cape
git add web/users/admin.py tests/web/test_auth_strip_admin.py
git commit -m "refactor(admin): unregister User/Group/Token/EmailAddress/Social*

SPA owns all auth/token UI. /admin/auth/user/, /admin/auth/group/,
/admin/authtoken/tokenproxy/, /admin/account/emailaddress/, and
/admin/socialaccount/* now return 404. Removes CustomUserAdmin /
ProfileInline / make_active / make_deactivated (SPA replaced them).

UserProfile model + post_save signal in web/users/models.py untouched
(apiv3 endpoints depend on it)."
```

---

## Task 2: URL surgery in `web/web/urls.py`

**Files:**
- Modify: `web/web/urls.py` (replace `include("allauth.urls")` + drop TWOFA block)
- Test: `tests/web/test_auth_strip_urls.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_auth_strip_urls.py
"""Lock-in: only /accounts/login/ and /accounts/logout/ are registered;
all other allauth URLs (signup / email / password reset / social) 404.
URL names account_login / account_logout still resolve."""
import pytest
from django.urls import NoReverseMatch, reverse
from rest_framework.test import APIClient


def _client():
    return APIClient()


@pytest.mark.django_db
def test_login_returns_200():
    assert _client().get("/accounts/login/").status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("path", [
    "/accounts/signup/",
    "/accounts/email/",
    "/accounts/password/change/",
    "/accounts/password/reset/",
    "/accounts/password/reset/done/",
    "/accounts/confirm-email/some-token-key/",
    "/accounts/social/login/cancelled/",
])
def test_path_returns_404(path):
    assert _client().get(path).status_code == 404, f"{path} should 404"


@pytest.mark.django_db
def test_url_name_account_login_resolves():
    assert reverse("account_login") == "/accounts/login/"


@pytest.mark.django_db
def test_url_name_account_logout_resolves():
    assert reverse("account_logout") == "/accounts/logout/"


@pytest.mark.django_db
@pytest.mark.parametrize("name", [
    "account_signup", "account_email", "account_change_password",
    "account_reset_password", "account_confirm_email",
])
def test_url_name_unregistered_raises(name):
    with pytest.raises(NoReverseMatch):
        reverse(name)
```

- [ ] **Step 2: run remote, expect FAIL** — `/accounts/signup/` etc. currently return 200 (allauth-rendered).

- [ ] **Step 3: edit `web/web/urls.py`**

Find the existing block at lines 18-21:

```python
if settings.TWOFA:
    from django_otp.admin import OTPAdminSite

    admin.site.__class__ = OTPAdminSite
```

**Delete** the entire block (4 lines + leading blank line).

Find line ~37:

```python
    path("accounts/", include("allauth.urls")),
```

**Replace** with:

```python
    # accounts/ — username/password only (was include("allauth.urls"))
    # Selective exposure: login + logout. signup / email / password reset
    # / social / 2FA all 404. Admin creates users via SPA /users; forgotten
    # passwords reset via SPA /users/<id>/Set-password.
    path("accounts/login/", _allauth_login_view, name="account_login"),
    path("accounts/logout/", _allauth_logout_view, name="account_logout"),
```

Add the imports at the top of the file (with other imports):

```python
from allauth.account.views import LoginView as _allauth_LoginView
from allauth.account.views import LogoutView as _allauth_LogoutView

_allauth_login_view = _allauth_LoginView.as_view()
_allauth_logout_view = _allauth_LogoutView.as_view()
```

(Module-level `as_view()` calls are fine since allauth's views are stateless. Underscore prefix to mark as module-private.)

- [ ] **Step 4: deploy + rerun, expect PASS**

```bash
sshpass -p ubuntu rsync -av web/web/urls.py tests/web/test_auth_strip_urls.py ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/urls.py /opt/CAPEv2/web/web/urls.py \
   && echo ubuntu | sudo -S cp /tmp/test_auth_strip_urls.py /opt/CAPEv2/tests/web/ \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/web/web/urls.py /opt/CAPEv2/tests/web/test_auth_strip_urls.py \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/test_auth_strip_urls.py -v 2>&1 | tail -15'
```

Expected: all pass (1 + 7 + 1 + 1 + 5 = 15 tests, plus parametrize expansion).

If any `/accounts/<X>/` test fails because Django returns redirect (302) or 200 from a stale handler, investigate — possibly there's still an `include` somewhere. Search:

```bash
grep -rn "include.*allauth" web/ 2>/dev/null
```

Should return no hits beyond the modified `urls.py`.

- [ ] **Step 5: Django check**

```bash
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py check 2>&1 | tail -3'
```

Expected: only the pre-existing `ACCOUNT_EMAIL_REQUIRED` deprecation warning.

- [ ] **Step 6: commit**

```bash
git add web/web/urls.py tests/web/test_auth_strip_urls.py
git commit -m "refactor(urls): replace include('allauth.urls') with login+logout allowlist

All allauth /accounts/* paths except /accounts/login/ and /accounts/logout/
now 404 (signup / email / password change / password reset / confirm-email
/ social/* all gone). URL names account_login / account_logout preserved
so LOGIN_URL / @login_required redirects continue to work.

Also drops the TWOFA admin.site.__class__ = OTPAdminSite block — TWOFA
config is removed in a follow-up commit."
```

---

## Task 3: clean `web/web/settings.py`

**Files:**
- Modify: `web/web/settings.py` (drop TWOFA + ACCOUNT_SIGNUP_FORM_CLASS + commented django_otp lines)
- Test: `tests/web/test_auth_strip_settings.py` (new)

- [ ] **Step 1: write failing test**

```python
# tests/web/test_auth_strip_settings.py
"""Lock-in: TWOFA config + ACCOUNT_SIGNUP_FORM_CLASS gating removed.
INSTALLED_APPS no longer commented-references django_otp."""
from django.conf import settings


def test_no_twofa_setting():
    assert not hasattr(settings, "TWOFA"), \
        "TWOFA setting still exists; auth-strip Task 3 should remove it"


def test_no_signup_form_class():
    assert not hasattr(settings, "ACCOUNT_SIGNUP_FORM_CLASS"), \
        "ACCOUNT_SIGNUP_FORM_CLASS still set; signup is gone, captcha gating must go too"


def test_login_url_preserved():
    assert settings.LOGIN_URL == "/accounts/login/"


def test_login_redirect_url_preserved():
    assert settings.LOGIN_REDIRECT_URL == "/"


def test_allauth_in_installed_apps():
    """Path A: keep allauth itself installed; only URL surgery + admin unregister."""
    assert "allauth" in settings.INSTALLED_APPS
    assert "allauth.account" in settings.INSTALLED_APPS
```

- [ ] **Step 2: run remote, expect 2 FAIL** (TWOFA + ACCOUNT_SIGNUP_FORM_CLASS still set per current settings.py).

- [ ] **Step 3: edit `web/web/settings.py`**

**Delete line 320**:
```python
TWOFA = web_cfg.web_auth.get("2fa", False)
```

**Delete lines 397-398**:
```python
if web_cfg.registration.get("captcha_enabled", False):
    ACCOUNT_SIGNUP_FORM_CLASS = "web.allauth_forms.CaptchedSignUpForm"
```

**Delete the commented lines 217 + 256-257** (they're already commented out but mention removed framework):
- Line 217: `# 'django_otp.middleware.OTPMiddleware',`
- Line 256: `# 'django_otp',`
- Line 257: `# 'django_otp.plugins.otp_totp',`

(Leaving the commented-out `# OTP_TOTP_ISSUER` line intact is fine; it's pure config and inert.)

Use Edit tool with surgical removals matching the exact lines.

- [ ] **Step 4: Django check + rerun**

```bash
sshpass -p ubuntu rsync -av web/web/settings.py tests/web/test_auth_strip_settings.py ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/settings.py /opt/CAPEv2/web/web/settings.py \
   && echo ubuntu | sudo -S cp /tmp/test_auth_strip_settings.py /opt/CAPEv2/tests/web/ \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/web/web/settings.py /opt/CAPEv2/tests/web/test_auth_strip_settings.py \
   && cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py check 2>&1 | tail -3 \
   && cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/test_auth_strip_settings.py -v 2>&1 | tail -10'
```

Expected: pre-existing deprecation warning + 5 PASS.

- [ ] **Step 5: commit**

```bash
git add web/web/settings.py tests/web/test_auth_strip_settings.py
git commit -m "chore(settings): drop TWOFA + ACCOUNT_SIGNUP_FORM_CLASS + django_otp comments

TWOFA config + django_otp middleware/app references removed (no 2FA
anywhere in this fork). ACCOUNT_SIGNUP_FORM_CLASS gating removed since
signup is gone (URL surgery in prior commit). LOGIN_URL,
LOGIN_REDIRECT_URL, allauth INSTALLED_APPS preserved."
```

---

## Task 4: clean `conf/default/web.conf.default`

**Files:**
- Modify: `conf/default/web.conf.default` (delete `2fa = no` line under `[web_auth]`; delete `captcha_enabled = no` line under `[registration]`)

This file is read at runtime via `web_cfg.web_auth.get(...)`. With the settings.py code removing those lookups (Task 3), the conf lines become dead config. Strip for hygiene.

- [ ] **Step 1: edit `conf/default/web.conf.default`**

Delete the line `2fa = no` (under `[web_auth]` section) and the line `captcha_enabled = no` (under `[registration]` section).

Use the Edit tool with `replace_all: false` and contextual lines to make the edits unique.

- [ ] **Step 2: deploy + Django check**

```bash
sshpass -p ubuntu rsync -av conf/default/web.conf.default ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/web.conf.default /opt/CAPEv2/conf/default/web.conf.default \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/conf/default/web.conf.default \
   && cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python manage.py check 2>&1 | tail -3'
```

Expected: pre-existing deprecation warning only.

- [ ] **Step 3: commit**

```bash
git add conf/default/web.conf.default
git commit -m "chore(conf): drop 2fa + captcha_enabled keys (no Python reads them anymore)"
```

---

## Task 5: delete obsolete templates

**Files:**
- Delete: 12 files under `web/templates/account/`
- Delete: entire `web/templates/socialaccount/` directory

- [ ] **Step 1: confirm survivors first**

```bash
ls /Users/lamba/github/cape/web/templates/account/
```

Expected (pre-delete): 15 files. We keep 3 (`_auth_layout.html`, `login.html`, `logout.html`). Delete the rest.

- [ ] **Step 2: delete account templates**

```bash
cd /Users/lamba/github/cape/web/templates/account
rm signup.html signup_closed.html email.html email_confirm.html \
   password_change.html password_reset.html password_reset_done.html \
   password_reset_from_key.html password_reset_from_key_done.html \
   verification_sent.html verified_email_required.html \
   account_inactive.html
```

Verify only 3 remain:
```bash
ls
# Expected: _auth_layout.html  login.html  logout.html
```

- [ ] **Step 3: delete socialaccount directory**

```bash
cd /Users/lamba/github/cape/web/templates
rm -rf socialaccount
```

- [ ] **Step 4: deploy + e2e regression**

Push all 3 modified python files + new templates state to remote:

```bash
cd /Users/lamba/github/cape
sshpass -p ubuntu rsync -av --delete web/templates/ ubuntu@192.168.1.6:/tmp/cape-templates/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S rsync -av --delete /tmp/cape-templates/ /opt/CAPEv2/web/templates/ \
   && echo ubuntu | sudo -S chown -R cape:cape /opt/CAPEv2/web/templates \
   && echo ubuntu | sudo -S systemctl restart cape-web'
sleep 4
curl -s -o /dev/null -w "/accounts/login/ → %{http_code}\n" http://192.168.1.6:8000/accounts/login/
```

Expected: `/accounts/login/` → 200 (login template still there + renders).

If login.html renders but errors with NoReverseMatch (because login.html still references `account_reset_password` URL name which no longer resolves) — this is fixed in Task 6. For now, accept temporary regression — Task 6 cleans login.html.

- [ ] **Step 5: commit**

```bash
git add -A web/templates/
git commit -m "chore(templates): delete 12 account/ + socialaccount/ obsolete templates

Removed: signup, signup_closed, email, email_confirm, password_change,
password_reset, password_reset_done, password_reset_from_key,
password_reset_from_key_done, verification_sent,
verified_email_required, account_inactive (12 files in account/);
entire socialaccount/ directory.

Kept: _auth_layout.html (parent), login.html, logout.html.

login.html still references account_reset_password URL name (NoReverseMatch
risk) — cleanup in next commit."
```

---

## Task 6: clean stale URL references in `login.html`

**Files:**
- Modify: `web/templates/account/login.html` (drop "Forgot password?" link line)

- [ ] **Step 1: read line 50 of login.html**

```bash
sed -n '45,55p' /Users/lamba/github/cape/web/templates/account/login.html
```

Note the exact wrapping markup around `{% url 'account_reset_password' %}`.

- [ ] **Step 2: edit `web/templates/account/login.html`**

Use the Edit tool to remove the entire `<a href="{% url 'account_reset_password' %}">{% trans "Forgot password?" %}</a>` line, plus any wrapping wrapper element (`<div>`, `<p>`, etc.) that contains ONLY this link. If the wrapper contains other content (e.g. login button + forgot-password link in same row), keep wrapper + only delete the `<a>` element.

After edit, confirm no remaining references to removed URL names:

```bash
grep -nE "account_signup|account_reset_password|account_email|socialaccount_login" web/templates/account/login.html
```

Expected: no output.

- [ ] **Step 3: deploy + smoke**

```bash
cd /Users/lamba/github/cape
sshpass -p ubuntu rsync -av web/templates/account/login.html ubuntu@192.168.1.6:/tmp/
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'echo ubuntu | sudo -S cp /tmp/login.html /opt/CAPEv2/web/templates/account/login.html \
   && echo ubuntu | sudo -S chown cape:cape /opt/CAPEv2/web/templates/account/login.html \
   && echo ubuntu | sudo -S systemctl restart cape-web'
sleep 4
# Render the login page and verify HTML is non-empty + has "CAPE" branding (from _auth_layout.html)
curl -s -o /tmp/login.html -w "HTTP %{http_code}\n" http://192.168.1.6:8000/accounts/login/
test -s /tmp/login.html && echo "non-empty body: OK"
grep -c '<form' /tmp/login.html | sed 's/^/forms in body: /'
grep -c "Forgot password" /tmp/login.html | sed 's/^/forgot-password references (should be 0): /'
```

Expected: HTTP 200, non-empty, ≥ 1 form, 0 forgot-password references.

- [ ] **Step 4: commit**

```bash
git add web/templates/account/login.html
git commit -m "chore(templates): drop 'Forgot password?' link from login.html

allauth's password reset URL was unmounted in Task 2; the link in
login.html caused NoReverseMatch on render. Forgot-password flow is
now: ask admin to use SPA /users/<id>/Set-password."
```

---

## Task 7: regression e2e + final smoke

**Files:** none modified — verification only.

- [ ] **Step 1: run full e2e battery**

```bash
cd /Users/lamba/github/cape/frontend/app
export PARITY_SPA_URL=http://192.168.1.6:8000 SPA_LOGIN_USER=admin
export 'SPA_LOGIN_PASS=cape123!'

# Batch 1
npx playwright test \
  tests/e2e/audit-log.spec.mjs \
  tests/e2e/phase-a-network-probe.spec.mjs \
  tests/e2e/recent-detail-display.spec.mjs \
  tests/e2e/docs-page.spec.mjs \
  tests/e2e/account-self-service.spec.mjs \
  tests/e2e/users-management.spec.mjs --reporter=line

# Restart between batches to avoid SQLAlchemy pool exhaustion (known infra issue)
sshpass -p ubuntu ssh ubuntu@192.168.1.6 'echo ubuntu | sudo -S systemctl restart cape-web' && sleep 4

# Batch 2
npx playwright test tests/e2e/smoke.spec.mjs --reporter=line
```

Expected: 21 passed across 7 spec files (3+1+2+1+4+3+7).

If `account-self-service.spec.mjs` "Change password full round-trip" fails because Phase A's account modal doesn't depend on `/accounts/password/change/` (it uses `/api/v3/me/password/`), this is unexpected — the modal should be unaffected. If it fails due to allauth's CSRF token rotation now behaving differently after URL surgery, restart cape-web + retry.

- [ ] **Step 2: full pytest run**

```bash
sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  'cd /opt/CAPEv2 && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -m pytest tests/web/ -v 2>&1 | tail -25'
```

Expected: all auth-strip tests + all prior session tests green. 5 pre-existing failures from earlier sessions (4 apiv2 reprocess + 1 mitre) acceptable; no NEW failures.

- [ ] **Step 3: manual login smoke**

```bash
# Anonymous probes
for path in /accounts/login/ /accounts/signup/ /accounts/password/reset/ \
            /accounts/email/ /admin/auth/user/ /admin/auth/group/ \
            /admin/authtoken/tokenproxy/ /admin/socialaccount/socialaccount/; do
  curl -s -o /dev/null -w "%-50s → %%{http_code}\n" "http://192.168.1.6:8000$path"
done

# Authed admin smoke
TOKEN=$(sshpass -p ubuntu ssh ubuntu@192.168.1.6 \
  "cd /opt/CAPEv2/web && echo ubuntu | sudo -S -u cape /opt/CAPEv2/.venv/bin/python -c \"
import django, os
os.environ['DJANGO_SETTINGS_MODULE']='web.settings'
django.setup()
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model
u=get_user_model().objects.filter(is_staff=True).first()
t,_=Token.objects.get_or_create(user=u)
print(t.key)\"" | tr -d '\r\n')

# Token API still works
curl -s -H "Authorization: Token $TOKEN" -o /dev/null \
  -w "/apiv2/cuckoo/status/ (with token) → %{http_code}\n" \
  http://192.168.1.6:8000/apiv2/cuckoo/status/

# /admin/ root still loads (other models)
curl -s -o /dev/null -w "/admin/login/ → %{http_code}\n" \
  http://192.168.1.6:8000/admin/login/
```

Expected:
- `/accounts/login/` → 200
- `/accounts/signup/`, `/accounts/password/reset/`, `/accounts/email/` → 404 (Django default 404, NOT SPA shell — these are explicit non-routes)
- `/admin/auth/user/`, `/admin/auth/group/`, `/admin/authtoken/tokenproxy/`, `/admin/socialaccount/socialaccount/` → 404
- `/apiv2/cuckoo/status/` → 200 with token
- `/admin/login/` → 200 (Django admin login page renders; we don't strip Django admin itself)

- [ ] **Step 4: no commit needed.** Pure verification gate.

If any failure here that's NOT pre-existing pool exhaustion: STOP and diagnose. Don't proceed to Task 8 with regressions.

---

## Task 8: docs

**Files:**
- Modify: `docs/web/api-reference.md` (add §Auth surface note)
- Modify: `docs/web/deploy-192.168.1.6.md` (append sub-spec #1 deployment record)

- [ ] **Step 1: append Auth surface section to `api-reference.md`**

Open `docs/web/api-reference.md`. Find the existing top-level structure and add a new "Authentication surface" section near the top (after the intro, before the endpoint tables):

```markdown
## Authentication Surface

After 2026-05-03 auth-strip (sub-spec #1), this deployment exposes only:

| Surface | Path | Method | Use |
|---|---|---|---|
| **Browser session** | `/accounts/login/` | GET form / POST | Username + password login (allauth) |
| **Browser session** | `/accounts/logout/` | GET / POST | Sign out |
| **API token** | `Authorization: Token <key>` | header on `/apiv2/*` and `/api/v3/*` | Programmatic access; tokens managed by admin in SPA `/users/<id>` API Token tab or self-service via avatar dropdown |

Removed in this sub-spec (return 404):
- `/accounts/signup/` — admin creates users via SPA `/users/new`
- `/accounts/password/reset/` and `/accounts/password/reset/key/<key>/` — forgotten password → ask admin to use SPA `/users/<id>/Set-password`
- `/accounts/password/change/` — SPA modal at avatar dropdown calls `POST /api/v3/me/password/`
- `/accounts/email/`, `/accounts/confirm-email/<key>/` — no email verification flow
- `/accounts/social/*` — no third-party OAuth provider configured
- `/admin/auth/user/`, `/admin/auth/group/`, `/admin/authtoken/tokenproxy/`, `/admin/account/emailaddress/`, `/admin/socialaccount/*` — replaced by SPA `/users` (and forthcoming `/groups`, `/tokens` per sub-specs #2 / #3)

`/admin/` itself still works for non-auth models (sites, django_recaptcha config, etc.).
```

- [ ] **Step 2: append deployment record to `deploy-192.168.1.6.md`**

```markdown
## 2026-05-03 — Sub-spec #1: auth-strip

按 `docs/superpowers/specs/2026-05-03-auth-strip-design.md` +
`docs/superpowers/plans/2026-05-03-auth-strip.md` 部署。

### 改动
- `web/users/admin.py` — 重写为 7-model unregister 集中点（User / Group /
  TokenProxy / EmailAddress / SocialAccount / SocialApp / SocialToken）
- `web/web/urls.py` — `include("allauth.urls")` 替换为 `accounts/login/`
  + `accounts/logout/` 白名单；TWOFA / OTPAdminSite 块删除
- `web/web/settings.py` — 删 TWOFA 配置 + ACCOUNT_SIGNUP_FORM_CLASS gating
  + django_otp 注释行
- `conf/default/web.conf.default` — 删 `[web_auth] 2fa` + `[registration]
  captcha_enabled` 键
- `web/templates/account/` — 删 12 个废弃模板 (signup / email / password reset
  / verification 等)；保留 _auth_layout / login / logout
- `web/templates/socialaccount/` — 整目录删
- `web/templates/account/login.html` — 删 "Forgot password?" 链接

### 实测
- pytest auth-strip suite: 27 case 全绿 (admin 7 + URL 15 + settings 5)
- pytest 全量: 无新 regression (仍是 pre-existing 5 个 apiv2 reprocess + mitre)
- Playwright e2e: 21/21 PASS (audit-log / network-probe / recent-detail / docs /
  account-self-service / users-management / smoke)
- 手动 smoke: /accounts/login/ → 200, /accounts/signup/ → 404,
  /admin/auth/user/ → 404, /apiv2/cuckoo/status/ + token → 200

凭证不变 (admin / cape123!)。下一步 sub-spec #2 (/groups SPA + apiv3 group CRUD).
```

- [ ] **Step 3: commit**

```bash
git add docs/web/api-reference.md docs/web/deploy-192.168.1.6.md
git commit -m "docs: api-reference auth surface + deploy record for sub-spec #1 auth-strip"
```

---

## Final

### Task F: push to origin

**Files:** none — operational only.

- [ ] **Step 1: confirm chain**

```bash
cd /Users/lamba/github/cape
git log --oneline cc37308b..HEAD
```

Expected: 8 new commits (Task 1–6 + Task 8 = 7 code commits, doc commit = 1).

(Task 7 is verification-only, no commit.)

- [ ] **Step 2: push**

```bash
git push origin refactor/web-spa
```

- [ ] **Step 3: no further commit needed.**

---

## Self-Review Checklist (controller, after all tasks)

1. Spec §3 endpoint matrix — each row covered:
   - `/accounts/login/` 200 (Task 2) ✅
   - `/accounts/logout/` 200 (Task 2) ✅
   - `/accounts/signup/` 404 (Task 2) ✅
   - `/accounts/email/` 404 (Task 2) ✅
   - `/accounts/password/change/` 404 (Task 2) ✅
   - `/accounts/password/reset/` 404 (Task 2) ✅
   - `/accounts/confirm-email/<key>/` 404 (Task 2) ✅
   - `/accounts/social/*` 404 (Task 2) ✅
   - `/admin/auth/user/` 404 (Task 1) ✅
   - `/admin/auth/group/` 404 (Task 1) ✅
   - `/admin/authtoken/tokenproxy/` 404 (Task 1) ✅
   - `/admin/account/emailaddress/` 404 (Task 1) ✅
   - `/admin/socialaccount/*` 404 (Task 1) ✅
2. Spec §4.1 URL surgery — Task 2 ✅ (login + logout allowlist + TWOFA block removal)
3. Spec §4.2 Admin unregister — Task 1 ✅ (7-model unregister)
4. Spec §4.3 Settings cleanup — Task 3 ✅ (TWOFA + ACCOUNT_SIGNUP_FORM_CLASS + django_otp comments)
5. Spec §4.4 Conf cleanup — Task 4 ✅
6. Spec §5.1 Template deletion — Task 5 ✅
7. Spec §5.2 login.html cleanup — Task 6 ✅
8. Spec §5.3 SPA grep — done by previous specs (no SPA references to allauth signup/reset/email/social); no task needed
9. Spec §6 verification — Task 7 (full e2e + pytest + manual smoke) ✅
10. Spec §10 file manifest — every file in plan has a task ✅
