"""apiv3 views.

Each function uses ``@extend_schema`` so drf-spectacular can produce a
faithful OpenAPI 3.1 description for the SPA's embedded Swagger UI.
"""

from __future__ import annotations

import sys

from django.conf import settings
from django.db.models import Q
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status as http_status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apiv3.serializers import (
    ApiErrorSerializer,
    AttackReportSerializer,
    BehaviorCallsResponseSerializer,
    BehaviorSummaryResponseSerializer,
    ChangePasswordSerializer,
    CompareCandidatesResponseSerializer,
    CompareDiffResponseSerializer,
    ConfigReportSerializer,
    CsrfTokenSerializer,
    CurrentUserSerializer,
    DroppedReportSerializer,
    FeatureFlagsSerializer,
    GroupSerializer,
    MachineSerializer,
    MeUpdateSerializer,
    NetworkReportSerializer,
    PayloadsReportSerializer,
    PermissionSerializer,
    ReportSummarySerializer,
    ScreenshotsReportSerializer,
    SearchPrefixesResponseSerializer,
    SearchResponseSerializer,
    StatisticsResponseSerializer,
    StaticReportSerializer,
    SubmissionFormDataSerializer,
    SystemInfoSerializer,
    TaskCreateResponseSerializer,
    TaskDlnexecSubmitSerializer,
    TaskDownloadServicesSubmitSerializer,
    TaskListResponseSerializer,
    TaskResubmitSerializer,
    TaskSummarySerializer,
    TaskUrlSubmitSerializer,
    TokenSerializer,
    UserCreateSerializer,
    UserListSerializer,
    UserSerializer,
    UserSetPasswordSerializer,
    UserUpdateSerializer,
)
from services import (
    compare_service,
    machine_service,
    report_service,
    search_service,
    statistics_service,
    submission_service,
    task_service,
)


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
    tags=["users"],
    summary="The current authenticated user.",
    description=(
        "GET returns the user representation. PATCH updates the user's "
        "first_name / last_name / email (self-service profile edit). "
        "Other User fields cannot be changed via this endpoint — "
        "username is the identifier, and is_staff/is_superuser/password "
        "require admin or the dedicated /me/password/ endpoint."
    ),
    responses={
        200: CurrentUserSerializer,
        400: OpenApiResponse(description="Validation error"),
        401: OpenApiResponse(description="Not authenticated"),
    },
)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request: Request) -> Response:
    user = request.user

    if request.method == "PATCH":
        serializer = MeUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changed_fields: list[str] = []
        for field, value in serializer.validated_data.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed_fields.append(field)
        if changed_fields:
            user.save(update_fields=changed_fields)
            try:
                from audit_log import helpers as audit
                audit.log(
                    "profile_update",
                    request=request,
                    actor=user,
                    target_type="user",
                    target_id=user.id,
                    target_label=f"user:{user.username}",
                    fields=changed_fields,
                )
            except Exception:  # noqa: BLE001
                # Audit failure must not break the API call.
                pass

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


@extend_schema(
    tags=["users"],
    summary="Change the current user's password.",
    description=(
        "Validates current_password, new == confirm, and the Django "
        "AUTH_PASSWORD_VALIDATORS chain (length / common-password / "
        "numeric-only / similarity-to-user-attributes). On success, "
        "user.set_password() + save() are called and the allauth "
        "password_changed signal fires — audit_log records a "
        "`password_change` event with the actor and source IP."
    ),
    responses={
        204: OpenApiResponse(description="Password changed."),
        400: OpenApiResponse(description="Validation error."),
        401: OpenApiResponse(description="Not authenticated."),
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_password_change(request: Request) -> Response:
    serializer = ChangePasswordSerializer(
        data=request.data, context={"user": request.user}
    )
    serializer.is_valid(raise_exception=True)
    user = request.user
    user.set_password(serializer.validated_data["new_password"])
    user.save(update_fields=["password"])
    # We bypass allauth's HTML password-change flow, so manually emit
    # allauth's password_changed signal — audit_log.signals listens for
    # it and writes the password_change row. Wrapped in try/except since
    # allauth may be absent in stripped-down deployments.
    try:
        from allauth.account.signals import password_changed

        password_changed.send(
            sender=user.__class__, request=request, user=user
        )
    except ImportError:  # pragma: no cover
        # allauth not installed — fall back to direct audit log call.
        try:
            from audit_log import helpers as audit

            audit.log(
                "password_change",
                request=request,
                actor=user,
                target_type="user",
                target_id=user.id,
                target_label=f"user:{user.username}",
            )
        except Exception:  # noqa: BLE001
            pass
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# API token — /me/token/ + /users/<id>/token/ share this dispatcher.
# Both endpoints expose GET (read), POST (create-or-rotate), DELETE (revoke).
# DRF's authtoken model is one-token-per-user, so POST atomically deletes
# any existing token then creates a new one.
# ---------------------------------------------------------------------------


def _token_payload(token):
    """Serialize a Token (or None) for the response body."""
    if token is None:
        return {"key": None, "created": None}
    return {"key": token.key, "created": token.created}


def _handle_token(request: Request, target_user) -> Response:
    """Dispatch GET/POST/DELETE for a given target user.

    Audit emits ``token_create`` on first creation, ``token_rotate`` on
    replacement, ``token_revoke`` on delete. Failures are swallowed so
    audit outages never break the API contract.
    """
    from rest_framework.authtoken.models import Token

    if request.method == "GET":
        try:
            tok = Token.objects.get(user=target_user)
        except Token.DoesNotExist:
            tok = None
        return Response(_token_payload(tok))

    if request.method == "POST":
        existing = Token.objects.filter(user=target_user).first()
        rotated = existing is not None
        if existing is not None:
            existing.delete()
        new_tok = Token.objects.create(user=target_user)
        try:
            from audit_log import helpers as audit

            audit.log(
                "token_rotate" if rotated else "token_create",
                request=request,
                actor=request.user,
                target_type="user",
                target_id=str(target_user.id),
                target_label=target_user.username,
            )
        except Exception:
            pass
        return Response(_token_payload(new_tok))

    # DELETE
    deleted, _ = Token.objects.filter(user=target_user).delete()
    if deleted:
        try:
            from audit_log import helpers as audit

            audit.log(
                "token_revoke",
                request=request,
                actor=request.user,
                target_type="user",
                target_id=str(target_user.id),
                target_label=target_user.username,
            )
        except Exception:
            pass
    return Response(status=http_status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=["users"],
    summary="Read / create-or-rotate / revoke the current user's API token.",
    description=(
        "GET returns ``{key, created}`` (key=null when no token exists). "
        "POST creates a new token, atomically replacing any existing one "
        "(rotate semantics — only one token per user). DELETE revokes."
    ),
    responses={200: TokenSerializer, 204: None},
)
@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def me_token(request: Request) -> Response:
    return _handle_token(request, request.user)


# ---------------------------------------------------------------------------
# Admin user management
# ---------------------------------------------------------------------------


_USERS_LIST_ALLOWED_ORDERING = frozenset(
    {
        "username",
        "-username",
        "date_joined",
        "-date_joined",
        "last_login",
        "-last_login",
    }
)
_USERS_LIST_DEFAULT_LIMIT = 20
_USERS_LIST_MAX_LIMIT = 100


def _parse_bool_param(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.lower() in ("1", "true", "yes")


@extend_schema(
    tags=["users"],
    summary="List users (admin only).",
    parameters=[
        OpenApiParameter(name="search", type=OpenApiTypes.STR, required=False),
        OpenApiParameter(name="is_staff", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="is_superuser", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="is_active", type=OpenApiTypes.BOOL, required=False),
        OpenApiParameter(name="group", type=OpenApiTypes.STR, required=False),
        OpenApiParameter(name="cursor", type=OpenApiTypes.INT, required=False),
        OpenApiParameter(name="limit", type=OpenApiTypes.INT, required=False),
        OpenApiParameter(name="ordering", type=OpenApiTypes.STR, required=False),
    ],
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def users_list(request: Request) -> Response:
    from django.contrib.auth.models import User

    if request.method == "POST":
        serializer = UserCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        user = User.objects.create_user(
            username=validated["username"],
            email=validated.get("email") or "",
            password=validated["password"],
            first_name=validated.get("first_name") or "",
            last_name=validated.get("last_name") or "",
        )
        user.is_staff = validated.get("is_staff", False)
        user.is_superuser = validated.get("is_superuser", False)
        user.is_active = validated.get("is_active", True)
        user.save()
        try:
            from audit_log import helpers as audit
            audit.log(
                "user_create",
                request=request,
                actor=request.user,
                target_type="user",
                target_id=str(user.id),
                target_label=user.username,
            )
        except Exception:
            pass
        return Response(
            UserSerializer(user).data, status=http_status.HTTP_201_CREATED
        )

    qs = User.objects.all().select_related("userprofile").prefetch_related("groups")

    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(username__icontains=search)
            | Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    for fld in ("is_staff", "is_superuser", "is_active"):
        parsed = _parse_bool_param(request.query_params.get(fld))
        if parsed is not None:
            qs = qs.filter(**{fld: parsed})

    group = request.query_params.get("group")
    if group:
        if group.isdigit():
            qs = qs.filter(groups__id=int(group))
        else:
            qs = qs.filter(groups__name=group)

    ordering = request.query_params.get("ordering") or "-date_joined"
    if ordering not in _USERS_LIST_ALLOWED_ORDERING:
        ordering = "-date_joined"
    qs = qs.order_by(ordering, "id")

    total = qs.count()

    cursor = request.query_params.get("cursor")
    if cursor and cursor.isdigit():
        qs = qs.filter(id__lt=int(cursor))

    try:
        limit = int(request.query_params.get("limit") or _USERS_LIST_DEFAULT_LIMIT)
    except ValueError:
        limit = _USERS_LIST_DEFAULT_LIMIT
    limit = max(1, min(limit, _USERS_LIST_MAX_LIMIT))

    rows = list(qs[: limit + 1])
    next_cursor = rows[limit].id if len(rows) > limit else None
    rows = rows[:limit]

    return Response(
        {
            "data": UserListSerializer(rows, many=True).data,
            "next_cursor": next_cursor,
            "total": total,
        }
    )


@extend_schema(tags=["users"], summary="User detail (admin only).")
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def users_detail(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404

    user = get_object_or_404(
        User.objects.select_related("userprofile").prefetch_related(
            "groups", "user_permissions"
        ),
        pk=user_id,
    )

    if request.method == "PATCH":
        serializer = UserUpdateSerializer(
            data=request.data, context={"request": request, "target": user}
        )
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        profile_data = validated.pop("userprofile", None)
        changed: list[str] = []
        for field, value in validated.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed.append(field)
        if changed:
            user.save(update_fields=changed)
        if profile_data is not None:
            prof = user.userprofile  # auto-created via post_save signal
            for k, v in profile_data.items():
                if getattr(prof, k) != v:
                    setattr(prof, k, v)
                    changed.append(f"userprofile.{k}")
            prof.save()
        if changed:
            try:
                from audit_log import helpers as audit
                audit.log(
                    "user_update",
                    request=request,
                    actor=request.user,
                    target_type="user",
                    target_id=str(user.id),
                    target_label=user.username,
                    fields=changed,
                )
            except Exception:
                pass
        user.refresh_from_db()
        return Response(UserSerializer(user).data)

    if request.method == "DELETE":
        if user.id == request.user.id:
            return _error(
                "self_delete_forbidden",
                "Cannot delete yourself.",
                http_code=http_status.HTTP_400_BAD_REQUEST,
            )
        if user.is_superuser and not request.user.is_superuser:
            return _error(
                "superuser_delete_forbidden",
                "Only superuser can delete superuser.",
                http_code=http_status.HTTP_400_BAD_REQUEST,
            )
        username = user.username
        user_id_copy = user.id
        user.delete()
        try:
            from audit_log import helpers as audit
            audit.log(
                "user_delete",
                request=request,
                actor=request.user,
                target_type="user",
                target_id=str(user_id_copy),
                target_label=username,
            )
        except Exception:
            pass
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    return Response(UserSerializer(user).data)


@extend_schema(tags=["users"], summary="Reset user password (admin override).")
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_set_password(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404

    user = get_object_or_404(User, pk=user_id)
    serializer = UserSetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user.set_password(serializer.validated_data["password"])
    user.save(update_fields=["password"])
    try:
        from audit_log import helpers as audit
        audit.log(
            "user_set_password",
            request=request,
            actor=request.user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.username,
        )
    except Exception:
        pass
    return Response(status=http_status.HTTP_204_NO_CONTENT)


def _users_set_active(
    request: Request, user_id: int, active: bool, action_key: str
) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404

    user = get_object_or_404(User, pk=user_id)
    if not active and user.id == request.user.id:
        return _error(
            "self_deactivate_forbidden",
            "Cannot deactivate yourself.",
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )
    if user.is_active != active:
        user.is_active = active
        user.save(update_fields=["is_active"])
    try:
        from audit_log import helpers as audit
        audit.log(
            action_key,
            request=request,
            actor=request.user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.username,
        )
    except Exception:
        pass
    return Response(UserSerializer(user).data)


@extend_schema(tags=["users"], summary="Activate user.")
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_activate(request: Request, user_id: int) -> Response:
    return _users_set_active(request, user_id, True, "user_activate")


@extend_schema(tags=["users"], summary="Deactivate user.")
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_deactivate(request: Request, user_id: int) -> Response:
    return _users_set_active(request, user_id, False, "user_deactivate")


@extend_schema(
    tags=["users"],
    summary="Bulk action over a set of user IDs (activate/deactivate/delete).",
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
def users_bulk_action(request: Request) -> Response:
    from django.contrib.auth.models import User

    ids = request.data.get("ids") or []
    action = request.data.get("action")
    if action not in ("activate", "deactivate", "delete"):
        return _error(
            "unknown_action",
            f"Unknown action: {action}",
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(ids, list):
        return _error(
            "ids_required",
            "ids must be a list",
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )

    success: list[int] = []
    failed: list[dict] = []
    for uid in ids:
        try:
            target = User.objects.get(pk=uid)
        except User.DoesNotExist:
            failed.append({"id": uid, "reason": "not found"})
            continue

        if action == "delete":
            if target.id == request.user.id:
                failed.append({"id": uid, "reason": "cannot delete yourself"})
                continue
            if target.is_superuser and not request.user.is_superuser:
                failed.append(
                    {"id": uid, "reason": "only superuser can delete superuser"}
                )
                continue
            target_username = target.username
            target.delete()
            try:
                from audit_log import helpers as audit
                audit.log(
                    "user_delete",
                    request=request,
                    actor=request.user,
                    target_type="user",
                    target_id=str(uid),
                    target_label=target_username,
                )
            except Exception:
                pass
            success.append(uid)
        elif action == "activate":
            if not target.is_active:
                target.is_active = True
                target.save(update_fields=["is_active"])
            try:
                from audit_log import helpers as audit
                audit.log(
                    "user_activate",
                    request=request,
                    actor=request.user,
                    target_type="user",
                    target_id=str(uid),
                    target_label=target.username,
                )
            except Exception:
                pass
            success.append(uid)
        elif action == "deactivate":
            if target.id == request.user.id:
                failed.append({"id": uid, "reason": "cannot deactivate yourself"})
                continue
            if target.is_active:
                target.is_active = False
                target.save(update_fields=["is_active"])
            try:
                from audit_log import helpers as audit
                audit.log(
                    "user_deactivate",
                    request=request,
                    actor=request.user,
                    target_type="user",
                    target_id=str(uid),
                    target_label=target.username,
                )
            except Exception:
                pass
            success.append(uid)

    return Response({"success": success, "failed": failed})


# ---------------------------------------------------------------------------
# Groups + Permissions list + per-user m2m PATCH
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["users"],
    summary="List all auth groups.",
    description="Returns every Django auth Group with a permission_count annotation.",
    responses={200: GroupSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def groups_list(_request: Request) -> Response:
    from django.contrib.auth.models import Group
    from django.db.models import Count

    rows = Group.objects.annotate(permission_count=Count("permissions")).order_by("name")
    data = [
        {"id": g.id, "name": g.name, "permission_count": g.permission_count}
        for g in rows
    ]
    return Response({"data": data})


@extend_schema(
    tags=["users"],
    summary="List Django auth permissions, optionally filtered by content type.",
    description=(
        "Optional ``?content_type=app_label.model`` filter narrows to the "
        "permissions of a single Django model (e.g. ``auth.user``)."
    ),
    responses={200: PermissionSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def permissions_list(request: Request) -> Response:
    from django.contrib.auth.models import Permission

    qs = Permission.objects.select_related("content_type").order_by(
        "content_type__app_label", "content_type__model", "codename"
    )
    ctf = request.query_params.get("content_type")
    if ctf and "." in ctf:
        app, model = ctf.split(".", 1)
        qs = qs.filter(content_type__app_label=app, content_type__model=model)
    data = [
        {
            "id": p.id,
            "name": p.name,
            "codename": p.codename,
            "content_type": {
                "app_label": p.content_type.app_label,
                "model": p.content_type.model,
            },
        }
        for p in qs
    ]
    return Response({"data": data})


@extend_schema(
    tags=["users"],
    summary="Replace a user's group membership.",
    description=(
        "PATCH with ``{group_ids: [int, ...]}`` replaces the user.groups "
        "m2m. Unknown ids are silently dropped — the response reflects "
        "the persisted state."
    ),
    request=inline_serializer(
        name="UserSetGroupsRequest",
        fields={"group_ids": serializers.ListField(child=serializers.IntegerField())},
    ),
    responses={200: UserSerializer},
)
@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def users_set_groups(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import Group, User
    from django.shortcuts import get_object_or_404

    user = get_object_or_404(User, pk=user_id)
    ids = request.data.get("group_ids")
    if ids is None:
        ids = []
    if not isinstance(ids, list):
        return _error(
            "group_ids_required",
            "group_ids must be a list",
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )
    valid_ids = list(Group.objects.filter(id__in=ids).values_list("id", flat=True))
    user.groups.set(valid_ids)
    try:
        from audit_log import helpers as audit
        audit.log(
            "user_update",
            request=request,
            actor=request.user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.username,
            groups_changed=True,
        )
    except Exception:
        pass
    user.refresh_from_db()
    return Response(UserSerializer(user).data)


@extend_schema(
    tags=["users"],
    summary="Replace a user's direct permissions.",
    description=(
        "PATCH with ``{permission_ids: [int, ...]}`` replaces the "
        "user.user_permissions m2m. Group-inherited permissions are not "
        "affected. Unknown ids are silently dropped."
    ),
    request=inline_serializer(
        name="UserSetPermissionsRequest",
        fields={"permission_ids": serializers.ListField(child=serializers.IntegerField())},
    ),
    responses={200: UserSerializer},
)
@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def users_set_permissions(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import Permission, User
    from django.shortcuts import get_object_or_404

    user = get_object_or_404(User, pk=user_id)
    ids = request.data.get("permission_ids")
    if ids is None:
        ids = []
    if not isinstance(ids, list):
        return _error(
            "permission_ids_required",
            "permission_ids must be a list",
            http_code=http_status.HTTP_400_BAD_REQUEST,
        )
    valid_ids = list(Permission.objects.filter(id__in=ids).values_list("id", flat=True))
    user.user_permissions.set(valid_ids)
    try:
        from audit_log import helpers as audit
        audit.log(
            "user_update",
            request=request,
            actor=request.user,
            target_type="user",
            target_id=str(user.id),
            target_label=user.username,
            permissions_changed=True,
        )
    except Exception:
        pass
    user.refresh_from_db()
    return Response(UserSerializer(user).data)


@extend_schema(
    tags=["users"],
    summary="Read / create-or-rotate / revoke another user's API token (admin only).",
    description=(
        "Same dispatcher as /me/token/, but operates on the user "
        "identified by ``user_id``. Requires staff privileges."
    ),
    responses={200: TokenSerializer, 204: None},
)
@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminUser])
def users_token(request: Request, user_id: int) -> Response:
    from django.contrib.auth.models import User
    from django.shortcuts import get_object_or_404

    target = get_object_or_404(User, pk=user_id)
    return _handle_token(request, target)


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


@extend_schema(
    tags=["system"],
    summary="Submission form data (packages / machines / routes / tags / config gates).",
    description=(
        "One-shot read of everything the SPA Submit page needs to render its "
        "dropdowns. Mirrors the dictionary upstream's web/submission/views.py "
        "passes to its template (``packages``, ``machines``, ``tags``, "
        "``vpns``, ``socks5s``, ``random_route``, ``all_exitnodes``, ``route``, "
        "``config``)."
    ),
    responses={200: SubmissionFormDataSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def submission_form_data(_request: Request) -> Response:
    payload = submission_service.get_form_data()
    return Response(SubmissionFormDataSerializer(payload).data)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["search"],
    summary="Cross-store extended search (mirror of upstream /analysis/search/).",
    description=(
        "Accepts the same `?search=<term>` query the upstream Bootstrap "
        "form posts. Auto-detects md5/sha1/sha256 hashes when no prefix "
        "is given. Returns TaskSummary[] for matching tasks."
    ),
    parameters=[
        OpenApiParameter(
            name="search",
            type=OpenApiTypes.STR,
            description="Raw search query. Use `prefix:value` form for typed searches.",
        ),
    ],
    responses={200: SearchResponseSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search(request: Request) -> Response:
    raw = request.query_params.get("search", "") or ""
    user = request.user
    user_id = getattr(user, "id", None) or 0
    privs = bool(getattr(user, "is_staff", False))
    result = search_service.run_search(raw, user_id=user_id, privs=privs)
    payload = {
        "ok": result.ok,
        "term": result.term,
        "value": result.value,
        "raw": result.raw,
        "error": result.error,
        "items": result.items,
    }
    return Response(SearchResponseSerializer(payload).data)


@extend_schema(
    tags=["search"],
    summary="Available search prefixes + their descriptions, grouped.",
    responses={200: SearchPrefixesResponseSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_prefixes(_request: Request) -> Response:
    return Response({"prefixes": search_service.list_search_prefixes()})


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["statistics"],
    summary="Time-windowed statistics — mirror of upstream /statistics/<days>/.",
    description=(
        "Aggregates over the trailing N days: total/average tasks, per-day "
        "added/reported/failed counts, processing/signatures/reporting "
        "module timings, top samples / detections / ASNs."
    ),
    parameters=[
        OpenApiParameter(
            name="days",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.PATH,
            description="Window size in days (e.g. 7, 30, 365).",
        ),
    ],
    responses={200: StatisticsResponseSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def statistics(_request: Request, days: int) -> Response:
    payload = statistics_service.get_statistics(int(days))
    return Response(StatisticsResponseSerializer(payload).data)


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["compare"],
    summary="Compare candidates — same-md5 analyses for the given task.",
    description=(
        "Mirror of upstream `web/compare/views.py:left()`. Returns the "
        "left task's TaskSummary plus every other Mongo analysis with the "
        "same `target.file.md5`."
    ),
    responses={200: CompareCandidatesResponseSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def compare_candidates(_request: Request, left_id: int) -> Response:
    result = compare_service.candidates(int(left_id))
    if not result.get("ok"):
        code = result.get("error_code", "compare_failed")
        return _error(
            code,
            result.get("error_value", "compare failed"),
            http_code=http_status.HTTP_404_NOT_FOUND if code.endswith("_not_found") else http_status.HTTP_400_BAD_REQUEST,
        )
    return Response(CompareCandidatesResponseSerializer(result).data)


@extend_schema(
    tags=["compare"],
    summary="Compare two analyses — behavior counts + summary intersection.",
    description=(
        "Mirror of upstream `web/compare/views.py:both()`. Calls "
        "`lib.cuckoo.common.compare.helper_percentages_mongo` and "
        "`helper_summary_mongo` to compute per-task behavior category "
        "percentages and the overlap of behavior-summary keys."
    ),
    responses={200: CompareDiffResponseSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def compare_diff(_request: Request, left_id: int, right_id: int) -> Response:
    result = compare_service.diff(int(left_id), int(right_id))
    if not result.get("ok"):
        code = result.get("error_code", "compare_failed")
        return _error(
            code,
            result.get("error_value", "compare failed"),
            http_code=http_status.HTTP_404_NOT_FOUND if code.endswith("_not_found") else http_status.HTTP_400_BAD_REQUEST,
        )
    return Response(CompareDiffResponseSerializer(result).data)


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
    summary="Delete a task and its on-disk + Mongo data.",
    description=(
        "Mirrors upstream `web/analysis/views.py:remove()`. Gated by the "
        "`web.conf [delete] enabled` flag for non-staff users; staff can "
        "always delete."
    ),
    responses={
        200: OpenApiResponse(description="Task deleted"),
        403: ApiErrorSerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def task_delete(request: Request, task_id: int) -> Response:
    from lib.cuckoo.common.config import Config

    web_conf = Config("web")
    delete_enabled = bool(getattr(web_conf.delete, "enabled", False))
    if not delete_enabled and not getattr(request.user, "is_staff", False):
        return _error(
            "delete_disabled",
            "Task deletion is disabled in web.conf and you are not staff.",
            http_code=http_status.HTTP_403_FORBIDDEN,
        )
    result = task_service.delete_task(task_id)
    if not result.get("ok"):
        return _error(
            result.get("error_code", "delete_failed"),
            result.get("error_value", "delete failed"),
            http_code=http_status.HTTP_404_NOT_FOUND,
        )
    return Response(result)


@extend_schema(
    tags=["tasks"],
    summary="Cuckoo task error rows attached to this task.",
    description=(
        "Mirrors upstream `db.view_errors(task_id)` — used by the Recent "
        "page to render an error indicator on rows that hit a problem "
        "during analysis or processing."
    ),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_errors(_request: Request, task_id: int) -> Response:
    rows = task_service.view_task_errors(task_id)
    return Response({"errors": rows})


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


@extend_schema(
    tags=["tasks"],
    summary="Submit a URL for download-and-execute analysis.",
    description=(
        "Host fetches `dlnexec` URL, stores it as a sample, and runs it "
        "as a normal file analysis. Useful when the URL points at the "
        "actual binary rather than a landing page."
    ),
    request=TaskDlnexecSubmitSerializer,
    responses={201: TaskCreateResponseSerializer, 400: ApiErrorSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_create_dlnexec(request: Request) -> Response:
    from lib.cuckoo.common.web_utils import apiconf

    if not apiconf.dlnexeccreate.get("enabled"):
        return _error("dlnexec_disabled", "DL & exec API is disabled", http_code=http_status.HTTP_403_FORBIDDEN)

    serializer = TaskDlnexecSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return _error("invalid_request", "validation failed", http_code=http_status.HTTP_400_BAD_REQUEST, **serializer.errors)

    result = task_service.submit_dlnexec_request(request)
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


@extend_schema(
    tags=["tasks"],
    summary="Pull samples from third-party services by hash and submit.",
    description=(
        "Wraps v2's `download_from_3rdparty` (VirusTotal / MalwareBazaar "
        "/ etc, depending on what's configured under `[downloading_services]` "
        "in api.conf). Optional `options=apikey=<vt_api_key>` for VT pulls."
    ),
    request=TaskDownloadServicesSubmitSerializer,
    responses={201: TaskCreateResponseSerializer, 400: ApiErrorSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_create_download_services(request: Request) -> Response:
    from lib.cuckoo.common.web_utils import apiconf

    if not apiconf.downloading_services.get("enabled"):
        return _error(
            "download_services_disabled",
            "Download services API is disabled",
            http_code=http_status.HTTP_403_FORBIDDEN,
        )

    serializer = TaskDownloadServicesSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return _error("invalid_request", "validation failed", http_code=http_status.HTTP_400_BAD_REQUEST, **serializer.errors)

    result = task_service.submit_download_services_request(request)
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


@extend_schema(
    tags=["tasks"],
    summary="Resubmit a binary on disk by sha256/sha1/md5.",
    description=(
        "Mirrors the resubmit branch of upstream `web/submission/views.py:index()`. "
        "Looks the binary up in db.sample_path_by_hash() / "
        "storage/analyses/<task_id>/{binary,selfextracted,files,procdump,CAPE}, "
        "stages it under TEMP_PATH/cape-resubmit, then submits via download_file. "
        "`job_category` lets the caller switch the task type after lookup "
        "(sample/static/pcap/dlnexec/vtdl/bazaar)."
    ),
    request=TaskResubmitSerializer,
    responses={201: TaskCreateResponseSerializer, 400: ApiErrorSerializer, 404: ApiErrorSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_resubmit(request: Request, task_id: int, file_hash: str) -> Response:
    serializer = TaskResubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return _error("invalid_request", "validation failed", http_code=http_status.HTTP_400_BAD_REQUEST, **serializer.errors)

    job_category = serializer.validated_data.get("job_category")
    result = submission_service.resubmit_by_hash(
        request,
        task_id=task_id,
        file_hash=file_hash,
        job_category=job_category,
    )
    if not result.get("ok"):
        code = result.get("error_code", "submit_failed")
        http_code = (
            http_status.HTTP_404_NOT_FOUND if code == "binary_not_found" else http_status.HTTP_400_BAD_REQUEST
        )
        return _error(code, result.get("error_value", "submission failed"), http_code=http_code)

    payload = {
        "task_ids": result["task_ids"],
        "message": "Resubmitted",
        "machines": [],
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


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["reports"],
    summary="Report header + tab counts + findings rail.",
    description=(
        "Drives the report page chrome. Returns enough data to render the "
        "verdict banner (via the embedded TaskSummary), decide which tabs "
        "to show (`available_sections`), populate tab badges (`tab_counts`), "
        "and fill the findings rail (`signatures`). Heavy per-tab content "
        "lives at /api/v3/reports/<id>/<section>/."
    ),
    responses={
        200: ReportSummarySerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_summary(_request: Request, task_id: int) -> Response:
    task = task_service.view_task(task_id)
    if not task:
        return _error("task_not_found", f"Task {task_id} not found", http_code=http_status.HTTP_404_NOT_FOUND)

    summary = report_service.fetch_summary(task_id)
    if summary is None:
        # Mongo lookup failed or no doc. Still return the Postgres-known
        # task so the SPA can render the header; available_sections will
        # be just ["summary"] so other tabs hide gracefully.
        summary = {
            "available_sections": ["summary"],
            "tab_counts": {},
            "signatures": [],
            "score": task.get("score"),
            "severity": task.get("severity") or "clean",
            "verdict": task.get("verdict") or "clean",
            "family": task.get("family"),
            "behavior_summary": {},
        }

    payload = {
        "task": task,
        **summary,
    }
    return Response(ReportSummarySerializer(payload).data)


@extend_schema(
    tags=["reports"],
    summary="Behavior tab — process tree + per-process summary.",
    description=(
        "Returns the recursive process tree (`processtree`) plus a flat "
        "`processes` list each carrying `pid`, `name`, and an approximate "
        "`calls_count`. The actual API-call records live in chunks; fetch "
        "them via `/api/v3/reports/<id>/behavior/calls/?pid=&page=`."
    ),
    responses={
        200: BehaviorSummaryResponseSerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_behavior(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_behavior(task_id)
    if data is None:
        return _error("behavior_unavailable", "No behavior data for this task", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(BehaviorSummaryResponseSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="One chunk (~100 calls) of API-call log for a given process.",
    parameters=[
        OpenApiParameter(name="pid", type=OpenApiTypes.INT, required=True),
        OpenApiParameter(name="page", type=OpenApiTypes.INT, required=False,
                         description="0-based chunk index; default 0"),
    ],
    responses={
        200: BehaviorCallsResponseSerializer,
        400: ApiErrorSerializer,
        404: ApiErrorSerializer,
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_behavior_calls(request: Request, task_id: int) -> Response:
    pid_raw = request.query_params.get("pid")
    if not pid_raw:
        return _error("pid_required", "pid query parameter is required", http_code=http_status.HTTP_400_BAD_REQUEST)
    try:
        pid = int(pid_raw)
        page = int(request.query_params.get("page") or 0)
    except ValueError:
        return _error("invalid_param", "pid and page must be integers", http_code=http_status.HTTP_400_BAD_REQUEST)

    # Optional upstream-parity filters — see fetch_behavior_calls docstring.
    category = request.query_params.get("category") or None
    apifilter = request.query_params.get("apifilter") or None
    caller = request.query_params.get("caller") or None
    tid = request.query_params.get("tid") or None

    data = report_service.fetch_behavior_calls(
        task_id,
        pid=pid,
        page=page,
        category=category,
        apifilter=apifilter,
        caller=caller,
        tid=tid,
    )
    if data is None:
        return _error("behavior_unavailable", "No behavior data for this task", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(BehaviorCallsResponseSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="Search behavior — query against summary buckets + recent API calls",
    responses={200: dict, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_behavior_search(request: Request, task_id: int) -> Response:
    q = request.query_params.get("q") or ""
    data = report_service.search_behavior(task_id, q)
    if data is None:
        return _error("behavior_unavailable", "No behavior data for this task", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(data)


@extend_schema(
    tags=["reports"],
    summary="Static analysis output — PE info, certs, imports, capa, …",
    responses={200: StaticReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_static(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_static(task_id)
    if data is None:
        return _error("static_unavailable", "No static analysis data", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(StaticReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="MITRE ATT&CK matrix — TTPs + tactic/technique mapping.",
    description="Pass-through of mapTTPs.py output (PRD OQ2).",
    responses={200: AttackReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_attack(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_attack(task_id)
    if data is None:
        return _error("attack_unavailable", "No ATT&CK mapping for this task", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(AttackReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="CAPE-extracted malware configuration (per family).",
    responses={200: ConfigReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_config(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_config(task_id)
    if data is None:
        return _error("config_unavailable", "No malware configuration recorded", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(ConfigReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="Network tab — hosts / DNS / TCP / UDP / HTTP / Suricata.",
    description=(
        "Single-roundtrip aggregate. Heavy protocols (raw HTTP flows, "
        "Suricata alerts) may move to dedicated sub-endpoints under "
        "/api/v3/reports/<id>/network/<protocol>/ later (PRD D-29)."
    ),
    responses={200: NetworkReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_network(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_network(task_id)
    if data is None:
        return _error("network_unavailable", "No network data", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(NetworkReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="Files dropped by the sample inside the guest VM.",
    responses={200: DroppedReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_dropped(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_dropped(task_id)
    if data is None:
        return _error("dropped_unavailable", "No dropped-files data", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(DroppedReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="CAPE-unpacked payloads (per-payload metadata; bytes via v2).",
    responses={200: PayloadsReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_payloads(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_payloads(task_id)
    if data is None:
        return _error("payloads_unavailable", "No payloads data", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(PayloadsReportSerializer(data).data)


@extend_schema(
    tags=["reports"],
    summary="Screenshot index for the analysis (PNG bytes via v2).",
    description=(
        "Returns a list of `{index, url, thumbnail_url}` entries; the SPA "
        "renders the URLs through standard <img> tags with cookie auth, "
        "consuming the legacy /apiv2/tasks/get/screenshot/<id>/<n>/ "
        "route."
    ),
    responses={200: ScreenshotsReportSerializer, 404: ApiErrorSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_screenshots(_request: Request, task_id: int) -> Response:
    data = report_service.fetch_screenshots(task_id)
    if data is None:
        return _error("screenshots_unavailable", "No screenshots data", http_code=http_status.HTTP_404_NOT_FOUND)
    return Response(ScreenshotsReportSerializer(data).data)


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


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


@extend_schema(
    tags=["audit"],
    summary="List audit events with optional filters (cursor-paginated).",
    parameters=[
        OpenApiParameter("cursor", str, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("limit", int, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("actor", str, OpenApiParameter.QUERY, required=False,
                         description="Match actor_username exactly."),
        OpenApiParameter("action", str, OpenApiParameter.QUERY, required=False,
                         description="Comma-separated action names; rows match if action is in the set."),
        OpenApiParameter("target_user", str, OpenApiParameter.QUERY, required=False,
                         description="Numeric → match target_id; non-numeric → match target_label."),
        OpenApiParameter("target_type", str, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("success", bool, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("since", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("until", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("q", str, OpenApiParameter.QUERY, required=False,
                         description="Fallback ILIKE on actor_username + target_label."),
    ],
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def audits_list(request: Request) -> Response:
    from audit_log.models import AuditEvent
    from apiv3.serializers import AuditListResponseSerializer

    qs = AuditEvent.objects.all().order_by("-timestamp", "-id")

    # ---- filters ----
    actor = request.query_params.get("actor")
    if actor:
        qs = qs.filter(actor_username=actor)

    action = request.query_params.get("action")
    if action:
        qs = qs.filter(action__in=[a.strip() for a in action.split(",") if a.strip()])

    tu = request.query_params.get("target_user")
    if tu:
        qs = qs.filter(target_type="user")
        if tu.isdigit():
            qs = qs.filter(target_id=tu)
        else:
            qs = qs.filter(target_label=tu)

    tt = request.query_params.get("target_type")
    if tt:
        qs = qs.filter(target_type=tt)

    succ = request.query_params.get("success")
    if succ is not None:
        if succ.lower() in ("true", "1", "yes"):
            qs = qs.filter(success=True)
        elif succ.lower() in ("false", "0", "no"):
            qs = qs.filter(success=False)

    # since / until: parse via Django's dateparse to avoid ValidationError /
    # 500 on garbage input. If unparseable, silently skip the filter — better
    # UX than 500'ing a security-sensitive endpoint.
    from django.utils.dateparse import parse_datetime  # noqa: PLC0415  (lazy: avoids unused import on most calls)

    since = request.query_params.get("since")
    if since:
        parsed = parse_datetime(since)
        if parsed is not None:
            qs = qs.filter(timestamp__gte=parsed)
    until = request.query_params.get("until")
    if until:
        parsed = parse_datetime(until)
        if parsed is not None:
            qs = qs.filter(timestamp__lt=parsed)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(Q(actor_username__icontains=q) | Q(target_label__icontains=q))

    # ---- cursor pagination (cursor = last seen id; sorted DESC) ----
    cursor = request.query_params.get("cursor")
    if cursor and cursor.isdigit():
        qs = qs.filter(id__lt=int(cursor))

    try:
        limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
    except ValueError:
        limit = 50

    rows = list(qs[:limit])
    next_cursor = str(rows[-1].id) if len(rows) == limit else None

    payload = {
        "data": [
            {
                "id": r.id,
                "timestamp": r.timestamp,
                "actor": {
                    "user_id": r.actor_user_id,
                    "username": r.actor_username,
                    "ip": r.actor_ip,
                    "user_agent": r.actor_user_agent,
                },
                "action": r.action,
                "success": r.success,
                "target": {
                    "type": r.target_type,
                    "id": r.target_id,
                    "label": r.target_label,
                },
                "metadata": r.metadata or {},
            }
            for r in rows
        ],
        "next_cursor": next_cursor,
    }
    return Response(AuditListResponseSerializer(payload).data)


@extend_schema(
    tags=["audit"],
    summary="List the action-value catalog (for SPA filter dropdown).",
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def audits_actions(_request: Request) -> Response:
    from audit_log import ACTIONS
    from apiv3.serializers import AuditActionListResponseSerializer

    payload = {
        "data": [
            {"value": v, "label": l, "category": c}
            for (v, l, c) in ACTIONS
        ]
    }
    return Response(AuditActionListResponseSerializer(payload).data)
