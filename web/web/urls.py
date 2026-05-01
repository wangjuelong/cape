# Copyright (C) 2010-2015 Cuckoo Foundation.
# This file is part of Cuckoo Sandbox - http://www.cuckoosandbox.org
# See the file 'docs/LICENSE' for copying permission.

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

if settings.TWOFA:
    from django_otp.admin import OTPAdminSite

    admin.site.__class__ = OTPAdminSite

admin.site.site_header = "CAPE Administration"
admin.site.site_title = "CAPE Administration"

from analysis import urls as analysis
from analysis import views as analysis_views_module  # for /_upstream rewrites
from apiv2 import urls as apiv2
from apiv3 import urls as apiv3
from compare import urls as compare
from compare import views as compare_views
from submission import urls as submission
from submission import views as submission_views
from audit import urls as audit
from web import spa_view

handler403 = "web.views.handler403"
handler404 = "web.views.handler404"

urlpatterns = [
    # ---- API + auth + admin: SPA must NOT shadow these ----
    re_path(r"^guac/", include("guac.urls")),
    path("accounts/", include("allauth.urls")),
    re_path(r"^admin/", admin.site.urls),
    re_path(r"^apiv2/", include(apiv2)),
    re_path(r"^api/v3/", include(apiv3)),
    path("robots.txt", TemplateView.as_view(template_name="robots.txt", content_type="text/plain")),

    # ---- Bootstrap upstream HTML routes — kept so the SPA's scrape
    # fallback + Behavior tab's lazy `/analysis/load_files/<id>/<cat>/`
    # lazy-load AJAX continue to work. ALSO kept so the URL-name registry
    # (`{% url 'submission' %}`, `{% url 'compare_left' %}`, …) resolves —
    # upstream's own templates and signals reference these by name. The
    # SPA catchall patterns further down win for browser GETs because they
    # appear *before* these includes in the dispatch order — except they
    # don't (Django takes the first match), so the includes are listed
    # AFTER the SPA catchalls below. ----
    re_path(r"^analysis/", include(analysis)),
    # SPA owns `/audit` (audit log browser); legacy upstream `audit/` test
    # suite include is shadowed for browser GETs but kept further down so
    # url-name reverses (`reverse('audit_index')`, etc.) still work.
    re_path(r"^audit(?:/.*)?$", spa_view.spa_index, name="spa-audit"),
    re_path(r"^audit/", include(audit), name="audit"),
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

    # ---- Upstream Bootstrap routes that the SPA shadows above. Re-mount
    # them at the end so `reverse('submission')`, `reverse('compare_left')`,
    # `reverse('compare_both')` and friends used by upstream templates and
    # signal handlers continue to resolve. They never receive browser GETs
    # because the SPA patterns above match first. ----
    re_path(r"^submit/", include(submission)),
    re_path(r"^compare/", include(compare)),

    # ---- /_upstream/<path> shim — in dev the Vite proxy maps these to
    # `/<path>` on Django; in prod (Django serves the SPA directly) we
    # need explicit Django routes so the SPA's HTML scrape fallback path
    # has somewhere to go. Each entry forwards to the same view the
    # corresponding upstream URL would. ----
    re_path(r"^_upstream/submit/?$", submission_views.index, name="upstream-submit"),
    re_path(r"^_upstream/analysis/?$", analysis_views_module.index, name="upstream-analysis-index"),
    re_path(
        r"^_upstream/analysis/pending/?$",
        analysis_views_module.pending,
        name="upstream-analysis-pending",
    ),
    re_path(
        r"^_upstream/analysis/search/?$",
        analysis_views_module.search,
        name="upstream-analysis-search",
    ),
    re_path(
        r"^_upstream/analysis/(?P<task_id>\d+)/?$",
        analysis_views_module.report,
        name="upstream-analysis-report",
    ),
    re_path(
        r"^_upstream/statistics/(?P<days>\d+)/?$",
        analysis_views.statistics_data,
        name="upstream-statistics",
    ),
    re_path(
        r"^_upstream/compare/(?P<left_id>\d+)/?$",
        compare_views.left,
        name="upstream-compare-left",
    ),
    re_path(
        r"^_upstream/compare/(?P<left_id>\d+)/(?P<right_id>\d+)/?$",
        compare_views.both,
        name="upstream-compare-both",
    ),
]
