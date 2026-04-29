"""apiv3 views.

Each function uses ``@extend_schema`` so drf-spectacular can produce a
faithful OpenAPI 3.1 description for the SPA's embedded Swagger UI.
"""

from __future__ import annotations

import sys

from django.conf import settings
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
)
from rest_framework import status as http_status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apiv3.serializers import (
    ApiErrorSerializer,
    CsrfTokenSerializer,
    CurrentUserSerializer,
    FeatureFlagsSerializer,
    MachineSerializer,
    SystemInfoSerializer,
    TaskCreateResponseSerializer,
    TaskListResponseSerializer,
    TaskSummarySerializer,
    TaskUrlSubmitSerializer,
)
from services import machine_service, task_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error(code: str, message: str, http_code: int = 400, **details) -> Response:
    payload = {"error": True, "error_code": code, "error_value": message}
    if details:
        payload["details"] = details
    return Response(payload, status=http_code)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["auth"],
    summary="Bootstrap CSRF cookie and return its value.",
    description=(
        "GET this once at SPA startup. Django sets the `csrftoken` cookie via "
        "@ensure_csrf_cookie; the body also returns the token so the SPA "
        "can stash it without parsing cookies."
    ),
    responses={200: CsrfTokenSerializer},
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request: Request) -> Response:
    token = get_token(request)
    return Response({"csrf_token": token})


@extend_schema(
    tags=["auth"],
    summary="Return the authenticated user.",
    description=(
        "Returns 401 when the session is missing/invalid; the SPA then "
        "redirects through /login-bridge → /accounts/login/."
    ),
    responses={
        200: CurrentUserSerializer,
        401: OpenApiResponse(description="Not authenticated"),
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request: Request) -> Response:
    user = request.user
    profile = getattr(user, "userprofile", None)
    payload = {
        "username": user.get_username(),
        "email": user.email or None,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "subscription": getattr(profile, "subscription", None) if profile else None,
        "reports_dl_allowed": (
            user.is_staff
            or bool(getattr(profile, "reports", False))
            or bool(getattr(settings, "ALLOW_DL_REPORTS_TO_ALL", False))
        ),
    }
    return Response(CurrentUserSerializer(payload).data)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["system"],
    summary="Sandbox build / runtime identification.",
    responses={200: SystemInfoSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def system_info(_request: Request) -> Response:
    from lib.cuckoo.common.constants import CUCKOO_VERSION

    payload = {
        "cape_version": CUCKOO_VERSION,
        "api_version": "v3",
        "python_version": ".".join(str(p) for p in sys.version_info[:3]),
    }
    return Response(SystemInfoSerializer(payload).data)


@extend_schema(
    tags=["system"],
    summary="Snapshot of api.conf [<endpoint>].enabled values.",
    responses={200: FeatureFlagsSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feature_flags(_request: Request) -> Response:
    from lib.cuckoo.common.web_utils import apiconf as api_conf

    flags: dict[str, bool] = {}
    for section_name in dir(api_conf):
        if section_name.startswith("_"):
            continue
        section = getattr(api_conf, section_name, None)
        enabled = None
        if hasattr(section, "get"):
            enabled = section.get("enabled")
        if isinstance(enabled, bool):
            flags[section_name] = enabled
    return Response(FeatureFlagsSerializer({"flags": flags}).data)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["tasks"],
    summary="List tasks (cursor-paginated, descending by id).",
    parameters=[
        OpenApiParameter(name="status", type=OpenApiTypes.STR, description="comma list of statuses"),
        OpenApiParameter(name="category", type=OpenApiTypes.STR),
        OpenApiParameter(name="cursor", type=OpenApiTypes.STR, description="opaque cursor from previous next_cursor"),
        OpenApiParameter(name="limit", type=OpenApiTypes.INT, description="default 50, max 200"),
    ],
    responses={200: TaskListResponseSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_list(request: Request) -> Response:
    statuses = request.query_params.get("status")
    filters = task_service.TaskListFilters(
        status=tuple(s.strip() for s in statuses.split(",")) if statuses else None,
        category=request.query_params.get("category") or None,
        cursor=request.query_params.get("cursor") or None,
        limit=int(request.query_params.get("limit") or 50),
        added_before=request.query_params.get("added_before") or None,
    )
    result = task_service.list_tasks(filters)
    payload = {
        "data": TaskSummarySerializer(result.items, many=True).data,
        "next_cursor": result.next_cursor,
    }
    return Response(payload)


@extend_schema(
    tags=["tasks"],
    summary="Single task summary.",
    responses={
        200: TaskSummarySerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_detail(_request: Request, task_id: int) -> Response:
    summary = task_service.view_task(task_id)
    if not summary:
        return _error("task_not_found", f"Task {task_id} not found", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(TaskSummarySerializer(summary).data)


@extend_schema(
    tags=["tasks"],
    summary="Submit a file for analysis (multipart).",
    description=(
        "Accepts multipart/form-data with a `file` field plus the 18 shared "
        "submission parameters (see PRD §5/Appendix A). Returns the created "
        "task IDs. 4xx with structured error payload on validation failure."
    ),
    request={"multipart/form-data": OpenApiTypes.OBJECT},
    responses={
        201: TaskCreateResponseSerializer,
        400: ApiErrorSerializer,
    },
)
@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def tasks_create_file(request: Request) -> Response:
    from lib.cuckoo.common.web_utils import apiconf

    if not apiconf.filecreate.get("enabled"):
        return _error("file_create_disabled", "File create API is disabled", http_code=http_status.HTTP_403_FORBIDDEN)

    result = task_service.submit_file_request(request)
    if not result.get("ok"):
        return _error(
            result.get("error_code", "submit_failed"),
            result.get("error_value", "submission failed"),
            http_code=http_status.HTTP_400_BAD_REQUEST,
            **{k: v for k, v in result.items() if k not in {"ok", "error_code", "error_value"}},
        )
    payload = {
        "task_ids": result["task_ids"],
        "message": result["message"],
        "machines": result.get("machines", []),
        "errors": result.get("errors", []),
    }
    return Response(TaskCreateResponseSerializer(payload).data, status=http_status.HTTP_201_CREATED)


@extend_schema(
    tags=["tasks"],
    summary="Submit a URL for analysis.",
    request=TaskUrlSubmitSerializer,
    responses={
        201: TaskCreateResponseSerializer,
        400: ApiErrorSerializer,
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_create_url(request: Request) -> Response:
    from lib.cuckoo.common.web_utils import apiconf

    if not apiconf.urlcreate.get("enabled"):
        return _error("url_create_disabled", "URL create API is disabled", http_code=http_status.HTTP_403_FORBIDDEN)

    serializer = TaskUrlSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return _error("invalid_request", "validation failed", http_code=http_status.HTTP_400_BAD_REQUEST, **serializer.errors)

    result = task_service.submit_url_request(request)
    if not result.get("ok"):
        return _error(
            result.get("error_code", "submit_failed"),
            result.get("error_value", "submission failed"),
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )
    payload = {
        "task_ids": result["task_ids"],
        "message": result["message"],
        "machines": result.get("machines", []),
        "errors": result.get("errors", []),
    }
    return Response(TaskCreateResponseSerializer(payload).data, status=http_status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Machines
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["machines"],
    summary="List registered analysis VMs.",
    responses={200: MachineSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def machines_list(_request: Request) -> Response:
    machines = machine_service.list_machines()
    return Response(MachineSerializer(machines, many=True).data)


@extend_schema(
    tags=["machines"],
    summary="View a single analysis VM by name.",
    responses={
        200: MachineSerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def machine_detail(_request: Request, name: str) -> Response:
    machine = machine_service.view_machine(name)
    if not machine:
        return _error("machine_not_found", f"Machine '{name}' not found", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(MachineSerializer(machine).data)
