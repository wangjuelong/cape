"""SPA owns all auth/token UI. Unregister User/Group/Token/EmailAddress/
SocialAccount from Django admin so /admin/auth/user/, /admin/auth/group/,
/admin/authtoken/, /admin/account/emailaddress/, /admin/socialaccount/*
return 404 — auth lives in /users (SPA)."""

from contextlib import suppress

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialApp, SocialToken
from django.contrib import admin
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import TokenProxy

# Force every other app's admin.py to import first. INSTALLED_APPS lists
# `users` ahead of allauth/authtoken/etc. so this module otherwise runs
# *before* their admin.site.register() calls, leaving the unregister loop
# with nothing to unregister. autodiscover() is idempotent — Django guards
# against re-importing this very module.
admin.autodiscover()

for _model in (User, Group, TokenProxy, EmailAddress,
               SocialAccount, SocialApp, SocialToken):
    with suppress(admin.sites.NotRegistered):
        admin.site.unregister(_model)
