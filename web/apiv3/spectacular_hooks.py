"""drf-spectacular preprocessing hooks for apiv3 (PRD §9 R8).

Reason: drf-spectacular's default scans every Django URL pattern, including
v2 endpoints that have no Serializer / @extend_schema annotations. The
result is a 70-path OpenAPI document where every legacy v2 entry shows
up as an empty stub. Filter to v3-only paths so the SPA's Swagger UI
stays focused.
"""

from __future__ import annotations

from typing import Any


def keep_only_v3(endpoints: list[tuple[str, Any, str, Any]], **_kwargs):
    """Return only endpoints under ``/api/v3/``.

    Used by ``SPECTACULAR_SETTINGS.PREPROCESSING_HOOKS``. The signature
    follows drf-spectacular's hook contract: accepts an iterable of
    ``(path, path_regex, method, callback)`` tuples and returns the
    filtered list.
    """
    return [entry for entry in endpoints if entry[0].startswith("/api/v3/")]
