"""Wire allauth + Django auth signals into audit_log.helpers.log().

Each receiver is wrapped in a `try/except` so a misbehaving handler
can't take down the originating signal (e.g. a typo here would
otherwise prevent ALL users from logging in)."""

from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth.signals import user_login_failed
from django.dispatch import receiver

from audit_log import helpers

_logger = logging.getLogger(__name__)


# allauth signals are conditionally available — guard the import so that
# environments without allauth still load this module.
try:
    from allauth.account.signals import (
        password_changed,
        password_reset,
        password_set,
        user_logged_in,
        user_logged_out,
        user_signed_up,
    )

    _HAS_ALLAUTH = True
except ImportError:  # pragma: no cover
    _HAS_ALLAUTH = False


def _safe(fn):
    """Decorate a receiver so its exceptions never escape into Django's
    signal dispatch loop. We log + swallow."""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            _logger.exception("audit_log signal handler failed: %s", fn.__name__)

    wrapper.__name__ = fn.__name__
    return wrapper


# ---------------------------------------------------------------------------
# Django auth signals
# ---------------------------------------------------------------------------


@receiver(user_login_failed)
@_safe
def _on_user_login_failed(sender: Any, credentials: dict, request=None, **kw):
    helpers.log(
        "login_failed",
        request=request,
        success=False,
        attempted_username=(credentials or {}).get("username", ""),
    )


# ---------------------------------------------------------------------------
# allauth signals
# ---------------------------------------------------------------------------

if _HAS_ALLAUTH:

    @receiver(user_logged_in)
    @_safe
    def _on_user_logged_in(sender: Any, request=None, user=None, **kw):
        helpers.log(
            "login_success",
            request=request,
            actor=user,
            target_type="user",
            target_id=getattr(user, "id", None),
            target_label=f"user:{getattr(user, 'username', '?')}",
        )

    @receiver(user_logged_out)
    @_safe
    def _on_user_logged_out(sender: Any, request=None, user=None, **kw):
        helpers.log(
            "logout",
            request=request,
            actor=user,
            target_type="user",
            target_id=getattr(user, "id", None) if user else None,
            target_label=f"user:{getattr(user, 'username', '?')}" if user else None,
        )

    @receiver(user_signed_up)
    @_safe
    def _on_user_signed_up(sender: Any, request=None, user=None, **kw):
        helpers.log(
            "signup",
            request=request,
            actor=user,
            target_type="user",
            target_id=getattr(user, "id", None),
            target_label=f"user:{getattr(user, 'username', '?')}",
        )

    @receiver(password_changed)
    @receiver(password_set)
    @_safe
    def _on_password_changed(sender: Any, request=None, user=None, **kw):
        helpers.log(
            "password_change",
            request=request,
            actor=user,
            target_type="user",
            target_id=getattr(user, "id", None),
            target_label=f"user:{getattr(user, 'username', '?')}",
        )

    @receiver(password_reset)
    @_safe
    def _on_password_reset(sender: Any, request=None, user=None, **kw):
        helpers.log(
            "password_reset_request",
            request=request,
            actor=user,
            target_type="user",
            target_id=getattr(user, "id", None) if user else None,
            target_label=f"user:{getattr(user, 'username', '?')}" if user else None,
            email=getattr(user, "email", "") if user else "",
        )
