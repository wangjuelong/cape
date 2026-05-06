# UserProfile model removed in sub-spec #8 (strip RBAC).
# Per-user subscription rates and per-user reports flag are gone — global
# api.conf [api] default_subscription_ratelimit and web.conf [general]
# allow_dl_reports_to_all replace them. The only auth fields the SPA cares
# about now live on django.contrib.auth.User itself.
