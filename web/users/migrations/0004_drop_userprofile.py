"""Drop UserProfile model — sub-spec #8 strip RBAC.

Per-user subscription / reports flags are replaced by global config:
- api.conf [api] default_subscription_ratelimit
- web.conf [general] allow_dl_reports_to_all
"""
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_rename_field_subscription"),
    ]

    operations = [
        migrations.DeleteModel(name="UserProfile"),
    ]
