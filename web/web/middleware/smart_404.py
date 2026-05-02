"""Unified 404 handler — overrides Django's technical_404 page (DEBUG=True) and
the redirect('/') handler404 (DEBUG=False) with a path-aware response.

Behavior:
- /api/v3/* and /apiv2/* paths return a JSON envelope so apiv2 / apiv3 clients
  get a structured error rather than HTML.
- /static/* and /favicon* return plain text (avoids serving SPA bundle for
  missing assets).
- All other paths get the SPA shell so the React router renders client-side
  NotFound — preserves the SPA navigation experience for users who land on
  an unrecognised browser URL.

Registered as the LAST middleware in MIDDLEWARE so it sees responses on the
way out, after every other layer has run.
"""
from __future__ import annotations

from django.http import HttpResponse, JsonResponse


_API_PREFIXES = ("/api/v3/", "/apiv2/")
_STATIC_PREFIXES = ("/static/", "/favicon")


def _is_api_path(path: str) -> bool:
    return any(path.startswith(p) for p in _API_PREFIXES)


def _is_static_path(path: str) -> bool:
    return any(path.startswith(p) for p in _STATIC_PREFIXES)


class Smart404Middleware:
    """Replace any 404 response with a path-aware unified one."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code != 404:
            return response

        path = request.path

        if _is_api_path(path):
            return JsonResponse(
                {"error": True, "error_value": "Not Found", "data": None},
                status=404,
            )

        if _is_static_path(path):
            return HttpResponse("Not Found", status=404, content_type="text/plain")

        # Browser route — serve SPA shell with status 200 so React router
        # can render a client-side <NotFound>. Avoid recursion if SPA bundle
        # itself is missing.
        from web import spa_view  # local import to avoid circular at startup

        try:
            return spa_view.spa_index(request)
        except Exception:
            # Fallback: plain 404 if SPA bundle isn't there yet.
            return HttpResponse("Not Found", status=404, content_type="text/plain")
