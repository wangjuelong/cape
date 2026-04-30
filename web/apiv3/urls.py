"""URL routes for /api/v3/.

Mounted at the project root under ``/api/v3/`` (web/web/urls.py).
Schema and Swagger UI come from drf-spectacular.
"""

from django.urls import path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

from apiv3 import sse, views

app_name = "apiv3"

urlpatterns = [
    # Auth
    path("auth/csrf/", views.csrf, name="csrf"),
    path("me/", views.me, name="me"),

    # System
    path("system/info/", views.system_info, name="system-info"),
    path("system/feature-flags/", views.feature_flags, name="feature-flags"),
    path("system/submission-form/", views.submission_form_data, name="submission-form-data"),

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

    # Events (SSE; PRD §6.5 — session auth only, requires ASGI / daphne)
    path("events/tasks", sse.task_events, name="events-tasks"),

    # OpenAPI
    path("schema/", SpectacularAPIView.as_view(api_version="v3"), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="apiv3:schema"), name="docs"),
]
