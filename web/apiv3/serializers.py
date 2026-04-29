"""Serializers for apiv3 endpoints.

Field names mirror frontend/web-design/data.js (PRD D-14). Keep the contract
flat (e.g. signatures_count, yara_matches) rather than nested.
"""

from rest_framework import serializers


class CurrentUserSerializer(serializers.Serializer):
    """Serializes the authenticated user for /api/v3/me/.

    The shape matches the CurrentUser interface in
    frontend/app/src/types/api.ts.
    """

    username = serializers.CharField()
    email = serializers.CharField(allow_null=True, allow_blank=True)
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    subscription = serializers.CharField(allow_null=True)
    reports_dl_allowed = serializers.BooleanField()


class CsrfTokenSerializer(serializers.Serializer):
    """Returns the current CSRF token cookie value.

    The browser already has the cookie thanks to ensure_csrf_cookie; this
    response is a convenience for SPA bootstrap (PRD §4.4 step 7).
    """

    csrf_token = serializers.CharField()


class SystemInfoSerializer(serializers.Serializer):
    """Sandbox-wide identification for /api/v3/system/info/."""

    cape_version = serializers.CharField()
    api_version = serializers.CharField()
    python_version = serializers.CharField()


class FeatureFlagsSerializer(serializers.Serializer):
    """Snapshot of api.conf [<endpoint>].enabled values.

    Returned as a flat boolean dict so the SPA can hide nav items / page
    sections that the operator has gated off.
    """

    flags = serializers.DictField(child=serializers.BooleanField())
