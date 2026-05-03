"""Lock-in: TWOFA config + ACCOUNT_SIGNUP_FORM_CLASS gating removed.
INSTALLED_APPS no longer commented-references django_otp."""
from django.conf import settings


def test_no_twofa_setting():
    assert not hasattr(settings, "TWOFA"), \
        "TWOFA setting still exists; auth-strip Task 3 should remove it"


def test_no_signup_form_class():
    assert not hasattr(settings, "ACCOUNT_SIGNUP_FORM_CLASS"), \
        "ACCOUNT_SIGNUP_FORM_CLASS still set; signup is gone, captcha gating must go too"


def test_login_url_preserved():
    assert settings.LOGIN_URL == "/accounts/login/"


def test_login_redirect_url_preserved():
    assert settings.LOGIN_REDIRECT_URL == "/"


def test_allauth_in_installed_apps():
    """Path A: keep allauth itself installed; only URL surgery + admin unregister."""
    assert "allauth" in settings.INSTALLED_APPS
    assert "allauth.account" in settings.INSTALLED_APPS
