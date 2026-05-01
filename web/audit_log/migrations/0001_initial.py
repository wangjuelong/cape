# Generated migration for audit_log.AuditEvent model

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                (
                    "timestamp",
                    models.DateTimeField(
                        db_index=True,
                        default=django.utils.timezone.now,
                    ),
                ),
                (
                    "actor_user_id",
                    models.IntegerField(blank=True, null=True),
                ),
                (
                    "actor_username",
                    models.CharField(
                        blank=True, max_length=150, null=True
                    ),
                ),
                (
                    "actor_ip",
                    models.GenericIPAddressField(blank=True, null=True),
                ),
                (
                    "actor_user_agent",
                    models.TextField(blank=True, null=True),
                ),
                (
                    "action",
                    models.CharField(max_length=64),
                ),
                (
                    "success",
                    models.BooleanField(default=True),
                ),
                (
                    "target_type",
                    models.CharField(
                        blank=True, max_length=32, null=True
                    ),
                ),
                (
                    "target_id",
                    models.CharField(
                        blank=True, max_length=64, null=True
                    ),
                ),
                (
                    "target_label",
                    models.CharField(
                        blank=True, max_length=255, null=True
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(default=dict),
                ),
            ],
            options={
                "db_table": "audit_events",
            },
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(
                fields=["-timestamp"],
                name="audit_events_timestamp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(
                fields=["actor_user_id", "-timestamp"],
                name="audit_events_actor_user_timestamp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(
                fields=["target_type", "target_id", "-timestamp"],
                name="audit_events_target_timestamp_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(
                fields=["action", "-timestamp"],
                name="audit_events_action_timestamp_idx",
            ),
        ),
    ]
