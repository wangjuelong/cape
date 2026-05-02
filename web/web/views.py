from django.conf import settings
from django.shortcuts import render

try:
    from django_ratelimit.exceptions import Ratelimited
except ImportError:
    try:
        from ratelimit.exceptions import Ratelimited
    except ImportError:
        print("missed dependency: poetry run pip install django-ratelimit -U")


def handler403(request, exception=None):
    if isinstance(exception, Ratelimited):
        return render(request, "error.html", {"error": settings.RATELIMIT_ERROR_MSG}, status=429)
    return render(request, "error.html", {"error": "Forbidden"}, status=403)


def handler404(request, exception=None):
    from django.http import HttpResponse, JsonResponse

    from web.middleware.smart_404 import _is_api_path, _is_static_path

    path = request.path
    if _is_api_path(path):
        return JsonResponse(
            {"error": True, "error_value": "Not Found", "data": None},
            status=404,
        )
    if _is_static_path(path):
        return HttpResponse("Not Found", status=404, content_type="text/plain")
    from web import spa_view

    return spa_view.spa_index(request)
