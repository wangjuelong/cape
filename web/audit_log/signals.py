"""Wire allauth + Django auth signals into audit_log.helpers.log().

Each receiver is wrapped in a `try/except` so a misbehaving handler
can't take down the originating signal (e.g. a typo here would
otherwise prevent ALL users from logging in)."""

from __future__ import annotations

import functools
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

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            _logger.exception("audit_log signal handler failed: %s", fn.__name__)

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

    # `password_set` fires when allauth assigns a password the first time
    # (e.g. completing a social signup); `password_changed` fires when an
    # existing password is replaced. Same audit semantic — one handler.
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


# ---------------------------------------------------------------------------
# Django admin LogEntry bridge
# ---------------------------------------------------------------------------

from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.db.models.signals import post_save


_LOG_ACTION_FLAG_MAP = {
    ADDITION: "admin_addition",
    CHANGE: "admin_change",
    DELETION: "admin_deletion",
}


@receiver(post_save, sender=LogEntry)
@_safe
def _on_admin_logentry(sender: Any, instance: LogEntry, created: bool, **kw):
    if not created:
        return  # only first save (LogEntry rows aren't typically updated)
    action = _LOG_ACTION_FLAG_MAP.get(instance.action_flag)
    if action is None:
        return
    actor = instance.user  # django.contrib.auth.User
    helpers.log(
        action,
        actor=actor,
        target_type=getattr(instance.content_type, "model", None) if instance.content_type_id else None,
        target_id=str(instance.object_id) if instance.object_id else None,
        target_label=instance.object_repr,
        change_message=instance.change_message or "",
    )
