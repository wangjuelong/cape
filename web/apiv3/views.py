"""apiv3 views.

Each function uses ``@extend_schema`` so drf-spectacular can produce a
faithful OpenAPI 3.1 description for the SPA's embedded Swagger UI.
"""

from __future__ import annotations

import sys

from django.conf import settings
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apiv3.serializers import (
    CsrfTokenSerializer,
    CurrentUserSerializer,
    FeatureFlagsSerializer,
    SystemInfoSerializer,
)


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
    description=(
        "The SPA queries this at startup to hide nav items / sections "
        "for endpoints that the operator has disabled. Mirrors the live "
        "values served by the legacy /apiv2/ self-inspection page."
    ),
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
