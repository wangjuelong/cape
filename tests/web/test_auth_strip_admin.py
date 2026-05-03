"""Lock-in: User/Group/TokenProxy/EmailAddress/SocialAccount/SocialApp/
SocialToken are NOT registered in Django admin after auth-strip.

Importing `users.admin` triggers admin.autodiscover() and the unregister
loop, so this module is the canonical entry point for verifying the
post-strip admin registry."""
import pytest

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialApp, SocialToken
from django.contrib import admin
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import TokenProxy

# Importing users.admin runs the unregister loop (which itself runs
# admin.autodiscover() first to be ordering-independent).
import users.admin  # noqa: F401


@pytest.mark.parametrize("model", [
    User, Group, TokenProxy, EmailAddress,
    SocialAccount, SocialApp, SocialToken,
])
def test_model_not_registered_in_admin(model):
    assert model not in admin.site._registry, (
        f"{model.__name__} is still registered in Django admin "
        "(auth-strip Task 1 should unregister it)"
    )
