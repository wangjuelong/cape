"""URL routes for /api/v3/.

Mounted at the project root under ``/api/v3/`` (web/web/urls.py).
Schema and Swagger UI come from drf-spectacular.
"""

from django.urls import path, re_path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

from apiv3 import legacy_views, sse, views

app_name = "apiv3"

urlpatterns = [
    # Auth
    path("auth/csrf/", views.csrf, name="csrf"),
    path("me/", views.me, name="me"),
    path("me/password/", views.me_password_change, name="me-password-change"),

    # Admin user management
    path("users/", views.users_list, name="users-list"),
    path("users/bulk-action/", views.users_bulk_action, name="users-bulk-action"),
    path("users/<int:user_id>/", views.users_detail, name="users-detail"),
    path("users/<int:user_id>/set-password/", views.users_set_password, name="users-set-password"),
    path("users/<int:user_id>/activate/", views.users_activate, name="users-activate"),
    path("users/<int:user_id>/deactivate/", views.users_deactivate, name="users-deactivate"),

    # System
    path("system/info/", views.system_info, name="system-info"),
    path("system/feature-flags/", views.feature_flags, name="feature-flags"),
    path("system/submission-form/", views.submission_form_data, name="submission-form-data"),

    # Search
    path("search/", views.search, name="search"),
    path("search/prefixes/", views.search_prefixes, name="search-prefixes"),

    # Statistics
    path("statistics/<int:days>/", views.statistics, name="statistics"),

    # Compare (mirror of upstream /compare/<left>/[<right>/])
    path("compare/<int:left_id>/", views.compare_candidates, name="compare-candidates"),
    path(
        "compare/<int:left_id>/<int:right_id>/",
        views.compare_diff,
        name="compare-diff",
    ),

    # Tasks
    path("tasks/", views.tasks_list, name="tasks-list"),
    path("tasks/<int:task_id>/", views.task_detail, name="task-detail"),
    path("tasks/<int:task_id>/delete/", views.task_delete, name="task-delete"),
    path("tasks/<int:task_id>/errors/", views.task_errors, name="task-errors"),
    path("tasks/file/", views.tasks_create_file, name="tasks-create-file"),
    path("tasks/url/", views.tasks_create_url, name="tasks-create-url"),
    path("tasks/dlnexec/", views.tasks_create_dlnexec, name="tasks-create-dlnexec"),
    path(
        "tasks/download_services/",
        views.tasks_create_download_services,
        name="tasks-create-download-services",
    ),
    path(
        "tasks/<int:task_id>/resubmit/<str:file_hash>/",
        views.tasks_resubmit,
        name="tasks-resubmit",
    ),

    # Reports
    path("reports/<int:task_id>/summary/", views.report_summary, name="report-summary"),
    path("reports/<int:task_id>/behavior/", views.report_behavior, name="report-behavior"),
    path(
        "reports/<int:task_id>/behavior/calls/",
        views.report_behavior_calls,
        name="report-behavior-calls",
    ),
    path(
        "reports/<int:task_id>/behavior/search/",
        views.report_behavior_search,
        name="report-behavior-search",
    ),
    path("reports/<int:task_id>/static/", views.report_static, name="report-static"),
    path("reports/<int:task_id>/attack/", views.report_attack, name="report-attack"),
    path("reports/<int:task_id>/config/", views.report_config, name="report-config"),
    path("reports/<int:task_id>/network/", views.report_network, name="report-network"),
    path("reports/<int:task_id>/dropped/", views.report_dropped, name="report-dropped"),
    path("reports/<int:task_id>/payloads/", views.report_payloads, name="report-payloads"),
    path(
        "reports/<int:task_id>/screenshots/",
        views.report_screenshots,
        name="report-screenshots",
    ),

    # Machines
    path("machines/", views.machines_list, name="machines-list"),
    path("machines/<str:name>/", views.machine_detail, name="machine-detail"),

    # Audit log
    path("audits/", views.audits_list, name="audits-list"),
    path("audits/actions/", views.audits_actions, name="audits-actions"),

    # Events (SSE; PRD §6.5 — session auth only, requires ASGI / daphne)
    path("events/tasks", sse.task_events, name="events-tasks"),

    # OpenAPI
    path("schema/", SpectacularAPIView.as_view(api_version="v3"), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="apiv3:schema"), name="docs"),

    # ---- Legacy bridge — every apiv2 endpoint mirrored under /api/v3/legacy/.
    # Behaviour identical to /apiv2/<path>; auth is IsAuthenticated (DRF
    # SessionAuthentication via cookie OR TokenAuthentication via header).
    # See apiv3/legacy_views.py for the full mapping. ----

    # Tasks ops
    path("legacy/tasks/create/static/", legacy_views.tasks_create_static, name="legacy-tasks-create-static"),
    re_path(r"^legacy/tasks/reschedule/(?P<task_id>\d+)/$", legacy_views.tasks_reschedule, name="legacy-tasks-reschedule"),
    re_path(r"^legacy/tasks/reprocess/(?P<task_id>\d+)/$", legacy_views.tasks_reprocess, name="legacy-tasks-reprocess"),
    re_path(r"^legacy/tasks/status/(?P<task_id>\d+)/$", legacy_views.tasks_status, name="legacy-tasks-status"),
    path("legacy/tasks/delete_many/", legacy_views.tasks_delete_many, name="legacy-tasks-delete-many"),
    re_path(r"^legacy/tasks/get/stream/(?P<task_id>\d+)/$", legacy_views.tasks_file_stream, name="legacy-tasks-stream"),

    # Hash-search shortcuts
    re_path(r"^legacy/tasks/search/md5/(?P<md5>[a-fA-F\d]{32})/$", legacy_views.tasks_search_md5, name="legacy-tasks-search-md5"),
    re_path(r"^legacy/tasks/search/sha1/(?P<sha1>[a-fA-F\d]{40})/$", legacy_views.tasks_search_sha1, name="legacy-tasks-search-sha1"),
    re_path(r"^legacy/tasks/search/sha256/(?P<sha256>[a-fA-F\d]{64})/$", legacy_views.tasks_search_sha256, name="legacy-tasks-search-sha256"),
    path("legacy/tasks/extendedsearch/", legacy_views.ext_tasks_search, name="legacy-tasks-extendedsearch"),

    # Report binary downloads
    re_path(r"^legacy/tasks/get/report/(?P<task_id>\d+)/$", legacy_views.tasks_report, name="legacy-tasks-report"),
    re_path(r"^legacy/tasks/get/report/(?P<task_id>\d+)/(?P<report_format>\w+)/$", legacy_views.tasks_report, name="legacy-tasks-report-format"),
    re_path(r"^legacy/tasks/get/report/(?P<task_id>\d+)/(?P<report_format>\w+)/(?P<make_zip>\w{3})/$", legacy_views.tasks_report, name="legacy-tasks-report-format-zip"),
    re_path(r"^legacy/tasks/get/iocs/(?P<task_id>\d+)/$", legacy_views.tasks_iocs, name="legacy-tasks-iocs"),
    re_path(r"^legacy/tasks/get/iocs/(?P<task_id>\d+)/(?P<detail>detailed)/$", legacy_views.tasks_iocs, name="legacy-tasks-iocs-detailed"),
    re_path(r"^legacy/tasks/get/config/(?P<task_id>\d+)/$", legacy_views.tasks_config, name="legacy-tasks-config"),
    re_path(r"^legacy/tasks/get/config/(?P<task_id>\d+)/(?P<cape_name>\w+)/$", legacy_views.tasks_config, name="legacy-tasks-config-name"),
    re_path(r"^legacy/tasks/get/screenshot/(?P<task_id>\d+)/$", legacy_views.tasks_screenshot, name="legacy-tasks-screenshot"),
    re_path(r"^legacy/tasks/get/screenshot/(?P<task_id>\d+)/(?P<screenshot>\d{1,4})/$", legacy_views.tasks_screenshot, name="legacy-tasks-screenshot-n"),
    re_path(r"^legacy/tasks/get/pcap/(?P<task_id>\d+)/$", legacy_views.tasks_pcap, name="legacy-tasks-pcap"),
    re_path(r"^legacy/tasks/get/tlspcap/(?P<task_id>\d+)/$", legacy_views.tasks_tlspcap, name="legacy-tasks-tlspcap"),
    re_path(r"^legacy/tasks/get/evtx/(?P<task_id>\d+)/$", legacy_views.tasks_evtx, name="legacy-tasks-evtx"),
    re_path(r"^legacy/tasks/get/dropped/(?P<task_id>\d+)/$", legacy_views.tasks_dropped, name="legacy-tasks-dropped"),
    re_path(r"^legacy/tasks/get/selfextracted/(?P<task_id>\d+)/$", legacy_views.tasks_selfextracted, name="legacy-tasks-selfextracted"),
    re_path(r"^legacy/tasks/get/selfextracted/(?P<task_id>\d+)/(?P<tool>[\w\-\.]+)/$", legacy_views.tasks_selfextracted, name="legacy-tasks-selfextracted-tool"),
    re_path(r"^legacy/tasks/get/surifile/(?P<task_id>\d+)/$", legacy_views.tasks_surifile, name="legacy-tasks-surifile"),
    re_path(r"^legacy/tasks/get/mitmdump/(?P<task_id>\d+)/$", legacy_views.tasks_mitmdump, name="legacy-tasks-mitmdump"),
    re_path(r"^legacy/tasks/get/payloadfiles/(?P<task_id>\d+)/$", legacy_views.tasks_payloadfiles, name="legacy-tasks-payloadfiles"),
    re_path(r"^legacy/tasks/get/procdumpfiles/(?P<task_id>\d+)/$", legacy_views.tasks_procdumpfiles, name="legacy-tasks-procdumpfiles"),
    re_path(r"^legacy/tasks/get/procmemory/(?P<task_id>\d+)/$", legacy_views.tasks_procmemory, name="legacy-tasks-procmemory"),
    re_path(r"^legacy/tasks/get/procmemory/(?P<task_id>\d+)/(?P<pid>\d{1,5})/$", legacy_views.tasks_procmemory, name="legacy-tasks-procmemory-pid"),
    re_path(r"^legacy/tasks/get/fullmemory/(?P<task_id>\d+)/$", legacy_views.tasks_fullmemory, name="legacy-tasks-fullmemory"),

    # Files endpoints
    re_path(r"^legacy/files/view/md5/(?P<md5>[a-fA-F\d]{32})/$", legacy_views.files_view_md5, name="legacy-files-view-md5"),
    re_path(r"^legacy/files/view/sha1/(?P<sha1>[a-fA-F\d]{40})/$", legacy_views.files_view_sha1, name="legacy-files-view-sha1"),
    re_path(r"^legacy/files/view/sha256/(?P<sha256>[a-fA-F\d]{64})/$", legacy_views.files_view_sha256, name="legacy-files-view-sha256"),
    re_path(r"^legacy/files/view/id/(?P<sample_id>\d+)/$", legacy_views.files_view_id, name="legacy-files-view-id"),
    re_path(r"^legacy/files/get/(?P<stype>md5)/(?P<value>[a-fA-F\d]{32})/$", legacy_views.file_download, name="legacy-files-get-md5"),
    re_path(r"^legacy/files/get/(?P<stype>sha1)/(?P<value>[a-fA-F\d]{40})/$", legacy_views.file_download, name="legacy-files-get-sha1"),
    re_path(r"^legacy/files/get/(?P<stype>sha256)/(?P<value>[a-fA-F\d]{64})/$", legacy_views.file_download, name="legacy-files-get-sha256"),
    re_path(r"^legacy/files/get/(?P<stype>task)/(?P<value>\d+)/$", legacy_views.file_download, name="legacy-files-get-task"),

    # System / misc
    path("legacy/cuckoo/status/", legacy_views.cuckoo_status, name="legacy-cuckoo-status"),
    path("legacy/exitnodes/", legacy_views.exit_nodes_list, name="legacy-exitnodes"),
    re_path(r"^legacy/tasks/get/latests/(?P<hours>\d+)/$", legacy_views.tasks_latest, name="legacy-tasks-latest"),
    path("legacy/tasks/stats/", legacy_views.task_x_hours, name="legacy-tasks-stats"),
]
