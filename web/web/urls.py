# Copyright (C) 2010-2015 Cuckoo Foundation.
# This file is part of Cuckoo Sandbox - http://www.cuckoosandbox.org
# See the file 'docs/LICENSE' for copying permission.

from allauth.account.views import LoginView as _allauth_LoginView
from allauth.account.views import LogoutView as _allauth_LogoutView
from analysis import views as analysis_views
from django.conf import settings
from django.conf.urls import include

# from django.contrib.auth import views as auth_views
from django.urls import path, re_path
from django.views.generic.base import TemplateView

if settings.NOCAPTCHA:
    from captcha_admin import admin
else:
    from django.contrib import admin

admin.site.site_header = "CAPE Administration"
admin.site.site_title = "CAPE Administration"


class _CapeLoginView(_allauth_LoginView):
    """LoginView that tolerates a missing ``account_signup`` URL.

    Upstream allauth unconditionally reverses ``account_signup`` in
    ``get_context_data`` to populate the "Sign up" link. After the
    auth-strip we expose only ``account_login`` / ``account_logout``,
    so the reverse raises NoReverseMatch and breaks GET /accounts/login/.
    Suppress that lookup — the SPA owns user creation, so the template
    never renders a signup link anyway.
    """

    def get_context_data(self, **kwargs):
        from django.urls import NoReverseMatch

        try:
            return super().get_context_data(**kwargs)
        except NoReverseMatch:
            from django.contrib.sites.shortcuts import get_current_site

            ret = super(_allauth_LoginView, self).get_context_data(**kwargs)
            ret["signup_url"] = None
            ret["site"] = get_current_site(self.request)
            ret["SOCIALACCOUNT_ENABLED"] = False
            ret["SOCIALACCOUNT_ONLY"] = False
            ret["LOGIN_BY_CODE_ENABLED"] = False
            ret["PASSKEY_LOGIN_ENABLED"] = False
            return ret


# Module-level as_view() calls — allauth's LoginView/LogoutView are
# stateless CBVs, so this is fine. Underscore prefix marks them as
# private to this module.
_allauth_login_view = _CapeLoginView.as_view()
_allauth_logout_view = _allauth_LogoutView.as_view()

from apiv2 import urls as apiv2
from apiv3 import urls as apiv3

from web import spa_view

handler403 = "web.views.handler403"
handler404 = "web.views.handler404"

urlpatterns = [
    # ---- API + auth + admin: SPA must NOT shadow these ----
    re_path(r"^guac/", include("guac.urls")),
    # accounts/ — username/password only (was include("allauth.urls"))
    # Selective exposure: login + logout. signup / email / password reset
    # / social / 2FA all 404. Admin creates users via SPA /users; forgotten
    # passwords reset via SPA /users/<id>/Set-password.
    path("accounts/login/", _allauth_login_view, name="account_login"),
    path("accounts/logout/", _allauth_logout_view, name="account_logout"),
    re_path(r"^admin/", admin.site.urls),
    re_path(r"^apiv2/", include(apiv2)),
    re_path(r"^api/v3/", include(apiv3)),
    path("robots.txt", TemplateView.as_view(template_name="robots.txt", content_type="text/plain")),
    # SPA owns `/audit` (audit log browser); legacy upstream `audit/` test
    # suite include is shadowed for browser GETs but kept further down so
    # url-name reverses (`reverse('audit_index')`, etc.) still work.
    re_path(r"^audit(?:/.*)?$", spa_view.spa_index, name="spa-audit"),
    # NB: `/dashboard/` Django Bootstrap include intentionally NOT mounted
    # at the top — anonymous redirects (allauth `next=/dashboard/`,
    # Django APPEND_SLASH on /dashboard) would otherwise land on the legacy
    # Bootstrap dashboard.views.index. The SPA catchall below now owns
    # `/dashboard*` exclusively and renders the SPA shell; the URL is just
    # an alias for `/` (router does Navigate(to="/")).
    re_path(r"statistics/(?P<days>\d+)/$", analysis_views.statistics_data, name="statistics_data"),
    # ---- Global file/report download endpoints (binary) ----
    re_path(r"^file/(?P<category>\w+)/(?P<task_id>\d+)/(?P<dlfile>\w+)/$", analysis_views.file, name="file"),
    re_path(
        r"^vtupload/(?P<category>\w+)/(?P<task_id>\d+)/(?P<filename>.+)/(?P<dlfile>\w+)/$", analysis_views.vtupload, name="vtupload"
    ),
    re_path(r"^filereport/(?P<task_id>\w+)/(?P<category>\w+)/$", analysis_views.filereport, name="filereport"),
    re_path(r"^full_memory/(?P<analysis_number>\w+)/$", analysis_views.full_memory_dump_file, name="full_memory_dump_file"),
    re_path(
        r"^full_memory_strings/(?P<analysis_number>\w+)/$", analysis_views.full_memory_dump_strings, name="full_memory_dump_strings"
    ),
    # ---- SPA catchall (must be last). Owns /, /recent, /pending, /search,
    # /stats/*, /tasks/*, /machines, /configs, /audit-spa, /login, /submit/*,
    # /compare/*, /dashboard/* — i.e. everything the React app routes
    # client-side. Backend Django views above (/analysis/, /apiv2/, etc.)
    # take precedence; the SPA only gets unmatched paths. ----
    # Alias the SPA root as `dashboard` too — upstream templates do
    # `{% url 'dashboard' %}` and break with NoReverseMatch otherwise.
    re_path(r"^$", spa_view.spa_index, name="dashboard"),
    re_path(r"^$", spa_view.spa_index, name="spa-root"),
    re_path(r"^submit(?:/.*)?$", spa_view.spa_index, name="spa-submit"),
    re_path(r"^compare(?:/.*)?$", spa_view.spa_index, name="spa-compare"),
    re_path(r"^recent(?:/.*)?$", spa_view.spa_index, name="spa-recent"),
    re_path(r"^pending(?:/.*)?$", spa_view.spa_index, name="spa-pending"),
    re_path(r"^search(?:/.*)?$", spa_view.spa_index, name="spa-search"),
    re_path(r"^stats(?:/.*)?$", spa_view.spa_index, name="spa-stats"),
    re_path(r"^tasks(?:/.*)?$", spa_view.spa_index, name="spa-tasks"),
    re_path(r"^machines(?:/.*)?$", spa_view.spa_index, name="spa-machines"),
    re_path(r"^configs(?:/.*)?$", spa_view.spa_index, name="spa-configs"),
    re_path(r"^login(?:/.*)?$", spa_view.spa_index, name="spa-login"),
    # SPA bounce route used by axios 401/403 interceptor. The page itself
    # immediately window.location.replace()'s to /accounts/login/?next=… —
    # we just need Django to serve the SPA shell so the React route runs.
    re_path(r"^login-bridge(?:/.*)?$", spa_view.spa_index, name="spa-login-bridge"),
    # Legacy /dashboard URL — SPA owns it now. allauth's LOGIN_REDIRECT_URL
    # default is `/`, but old bookmarks / hand-typed URLs still reach
    # /dashboard. SPA's React route does Navigate(to="/") and renders the
    # dashboard component there.
    re_path(r"^dashboard(?:/.*)?$", spa_view.spa_index, name="spa-dashboard"),
]
