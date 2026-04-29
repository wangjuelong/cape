"""URL routes for /api/v3/.

Mounted at the project root under ``/api/v3/`` (web/web/urls.py).
Schema and Swagger UI come from drf-spectacular.
"""

from django.urls import path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

from apiv3 import views

app_name = "apiv3"

urlpatterns = [
    # Auth
    path("auth/csrf/", views.csrf, name="csrf"),
    path("me/", views.me, name="me"),

    # System
    path("system/info/", views.system_info, name="system-info"),
    path("system/feature-flags/", views.feature_flags, name="feature-flags"),

    # OpenAPI
    path("schema/", SpectacularAPIView.as_view(api_version="v3"), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="apiv3:schema"), name="docs"),
]
