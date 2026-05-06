"""Unified permission classes for apiv3 (PRD §9 R5).

Consolidates the three orthogonal authorization signals that v2 currently
re-implements per-view:

1. ``[api] token_auth_enabled`` — global gate for token authentication
2. ``[<endpoint>] enabled`` — per-endpoint kill switch in api.conf
3. ``analysis.info.tlp == "red"`` — sample-level confidentiality
4. ``is_superuser`` — single-flag admin gate (sub-spec #8 collapsed RBAC)

v2 views must keep working unchanged; these helpers only apply to v3 views.
v2 may opt-in to these helpers later when its business logic is migrated
into ``web/services/``.
"""

from __future__ import annotations

from typing import Any

from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied


class ApiConfFlag(permissions.BasePermission):
    """Refuses the request if the configured api.conf flag is disabled.

    Subclass and set ``flag`` to the section name (matches ``api.conf``
    section name, e.g. ``"filecreate"``). The flag's ``enabled`` value is
    read live each time so operators can hot-toggle without restarting.
    """

    flag: str = ""

    def has_permission(self, request, view) -> bool:
        if not self.flag:
            return True
        from lib.cuckoo.common.web_utils import apiconf  # local import: avoids settings load order issues
        section = getattr(apiconf, self.flag, None)
        if section is None:
            return True
        return bool(section.get("enabled", False))

    @property
    def message(self) -> str:
        return f"{self.flag} API is disabled in api.conf"


class IsTaskTlpAllowed(permissions.BasePermission):
    """Object-level: blocks downloads on TLP-red tasks unless the caller
    is staff.

    Use as ``permission_classes = [..., IsTaskTlpAllowed]`` on report-detail
    style views. The view must implement ``get_object()`` returning a Task
    or analysis dict with ``info.tlp``.
    """

    message = "Task is TLP red"

    def has_object_permission(self, request, view, obj: Any) -> bool:
        if request.user.is_superuser:
            return True
        tlp = _extract_tlp(obj)
        return (tlp or "").lower() != "red"


class CanDownloadReports(permissions.BasePermission):
    """Gate heavy artefact downloads to superusers or globally per ALLOW_DL_REPORTS_TO_ALL."""

    message = "User is not allowed to download reports"

    def has_permission(self, request, view) -> bool:
        if request.user.is_superuser:
            return True
        from django.conf import settings as dj_settings
        return bool(getattr(dj_settings, "ALLOW_DL_REPORTS_TO_ALL", False))


class IsSuperUser(permissions.BasePermission):
    """Single-flag admin gate after sub-spec #8 collapsed RBAC.

    Replaces all uses of DRF's built-in IsAdminUser (which checks
    is_staff). is_staff stays bound to is_superuser for Django admin
    compatibility but no longer carries independent meaning.
    """

    message = "Superuser privileges required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )


def _extract_tlp(obj: Any) -> str | None:
    """Walks common shapes (Task model, Mongo doc, plain dict) for the
    ``info.tlp`` field."""
    info = None
    if isinstance(obj, dict):
        info = obj.get("info")
    else:
        info = getattr(obj, "info", None)
    if isinstance(info, dict):
        return info.get("tlp")
    return getattr(info, "tlp", None) if info is not None else None


def deny_if_tlp_red(obj: Any, *, user) -> None:
    """Imperative variant for non-DRF callers (e.g. service layer).

    Raises ``PermissionDenied`` so the caller can let the framework's
    exception handler convert it to 403.
    """
    if user.is_superuser:
        return
    if (_extract_tlp(obj) or "").lower() == "red":
        raise PermissionDenied("Task is TLP red")
