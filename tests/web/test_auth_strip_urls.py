"""Lock-in: only /accounts/login/ and /accounts/logout/ are registered;
all other allauth URLs (signup / email / password reset / social) 404.
URL names account_login / account_logout still resolve."""
import pytest
from django.urls import NoReverseMatch, reverse
from rest_framework.test import APIClient


def _client():
    return APIClient()


@pytest.mark.django_db
def test_login_returns_200():
    assert _client().get("/accounts/login/").status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("path", [
    "/accounts/signup/",
    "/accounts/email/",
    "/accounts/password/change/",
    "/accounts/password/reset/",
    "/accounts/password/reset/done/",
    "/accounts/confirm-email/some-token-key/",
    "/accounts/social/login/cancelled/",
])
def test_path_returns_404(path):
    assert _client().get(path).status_code == 404, f"{path} should 404"


@pytest.mark.django_db
def test_url_name_account_login_resolves():
    assert reverse("account_login") == "/accounts/login/"


@pytest.mark.django_db
def test_url_name_account_logout_resolves():
    assert reverse("account_logout") == "/accounts/logout/"


@pytest.mark.django_db
@pytest.mark.parametrize("name", [
    "account_signup", "account_email", "account_change_password",
    "account_reset_password", "account_confirm_email",
])
def test_url_name_unregistered_raises(name):
    with pytest.raises(NoReverseMatch):
        reverse(name)
