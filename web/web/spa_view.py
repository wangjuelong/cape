"""Serve the React SPA's `dist/index.html` for any unmatched non-API path.

Production deployment plan:
1. ``cd frontend/app && npm run build`` → produces ``frontend/app/dist/``.
2. Deploy ``dist/`` into Django's ``web/static/spa/``. Vite is configured
   with ``base: '/static/spa/'`` so the bundle's asset refs resolve
   under that prefix.
3. ``urls.py`` mounts ``spa_index`` as a catchall at the **end** of
   urlpatterns, so all real Django routes (``/api/v3/``, ``/apiv2/``,
   ``/admin/``, ``/accounts/``, ``/static/``, ``/analysis/``, etc.) are
   matched first; anything left over (``/``, ``/recent``, ``/tasks/3``,
   etc.) is handed off to the SPA, which then routes client-side.

Returns 404 if ``static/spa/index.html`` is missing — e.g. on a fresh
host that hasn't received a build yet.
"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404


_INDEX_PATH_CACHE: Path | None = None


def _resolve_index() -> Path | None:
    """Locate the SPA bundle's `index.html`. Walk known static roots once
    and cache the hit so repeat requests don't re-stat the filesystem."""
    global _INDEX_PATH_CACHE
    if _INDEX_PATH_CACHE is not None:
        return _INDEX_PATH_CACHE

    # Most common — Django app's bundled static dir.
    candidates = [
        Path(settings.BASE_DIR) / "static" / "spa" / "index.html",
        Path(settings.BASE_DIR) / "web" / "static" / "spa" / "index.html",
    ]
    # Honour STATICFILES_DIRS too.
    for d in getattr(settings, "STATICFILES_DIRS", []) or []:
        candidates.append(Path(d) / "spa" / "index.html")

    for c in candidates:
        if c.is_file():
            _INDEX_PATH_CACHE = c
            return c
    return None


def spa_index(request, path: str = ""):
    """Serve the SPA shell. The path arg is captured by the urlconf but
    ignored — client-side routing handles it."""
    del request, path
    idx = _resolve_index()
    if idx is None:
        raise Http404(
            "SPA bundle not found. Run `cd frontend/app && npm run build` "
            "and deploy `frontend/app/dist/` to `web/static/spa/`."
        )
    return FileResponse(open(idx, "rb"), content_type="text/html")
