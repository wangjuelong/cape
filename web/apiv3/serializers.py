"""Serializers for apiv3 endpoints.

Field names mirror frontend/web-design/data.js (PRD D-14). Keep the contract
flat (e.g. signatures_count, yara_matches) rather than nested.
"""

from rest_framework import serializers


# ---------------------------------------------------------------------------
# Auth / system
# ---------------------------------------------------------------------------


class CurrentUserSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.CharField(allow_null=True, allow_blank=True)
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    subscription = serializers.CharField(allow_null=True)
    reports_dl_allowed = serializers.BooleanField()


class CsrfTokenSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


class SystemInfoSerializer(serializers.Serializer):
    cape_version = serializers.CharField()
    api_version = serializers.CharField()
    python_version = serializers.CharField()


class FeatureFlagsSerializer(serializers.Serializer):
    flags = serializers.DictField(child=serializers.BooleanField())


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


SEVERITY_CHOICES = ("crit", "high", "med", "low", "clean")
VERDICT_CHOICES = ("malicious", "suspicious", "clean")


class TaskSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    target = serializers.CharField()
    sha256 = serializers.CharField(allow_null=True)
    sha1 = serializers.CharField(allow_null=True)
    md5 = serializers.CharField(allow_null=True)
    size = serializers.IntegerField(allow_null=True)
    type = serializers.CharField(allow_null=True)
    submitted = serializers.CharField(allow_null=True)
    started = serializers.CharField(allow_null=True)
    completed = serializers.CharField(allow_null=True)
    duration = serializers.CharField(allow_null=True)
    machine = serializers.CharField(allow_null=True)
    package = serializers.CharField(allow_blank=True)
    score = serializers.FloatField(allow_null=True)
    severity = serializers.ChoiceField(choices=SEVERITY_CHOICES)
    verdict = serializers.ChoiceField(choices=VERDICT_CHOICES)
    family = serializers.CharField(allow_null=True)
    signatures_count = serializers.IntegerField()
    yara_matches = serializers.IntegerField()
    network_count = serializers.IntegerField()
    files_dropped = serializers.IntegerField()
    payloads = serializers.IntegerField()
    api_calls = serializers.IntegerField()
    status = serializers.CharField()
    tags = serializers.ListField(child=serializers.CharField())


class TaskListResponseSerializer(serializers.Serializer):
    data = TaskSummarySerializer(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class TaskCreateResponseSerializer(serializers.Serializer):
    task_ids = serializers.ListField(child=serializers.IntegerField())
    message = serializers.CharField()
    machines = serializers.ListField(child=serializers.CharField(allow_blank=True))
    errors = serializers.ListField(required=False)


class TaskUrlSubmitSerializer(serializers.Serializer):
    url = serializers.URLField()
    package = serializers.CharField(required=False, allow_blank=True)
    timeout = serializers.IntegerField(required=False)
    priority = serializers.IntegerField(required=False, default=1)
    options = serializers.CharField(required=False, allow_blank=True)
    machine = serializers.CharField(required=False, allow_blank=True)
    platform = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.CharField(required=False, allow_blank=True)
    custom = serializers.CharField(required=False, allow_blank=True)
    memory = serializers.BooleanField(required=False, default=False)
    enforce_timeout = serializers.BooleanField(required=False, default=False)
    clock = serializers.CharField(required=False, allow_blank=True)
    referrer = serializers.URLField(required=False, allow_blank=True)
    tlp = serializers.CharField(required=False, allow_blank=True)
    tags_tasks = serializers.CharField(required=False, allow_blank=True)
    route = serializers.CharField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# Machines
# ---------------------------------------------------------------------------


class MachineSerializer(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.CharField()
    ip = serializers.CharField(allow_null=True)
    platform = serializers.CharField(allow_null=True)
    tags = serializers.ListField(child=serializers.CharField())
    status = serializers.CharField(allow_null=True)
    locked = serializers.BooleanField()
    locked_changed_on = serializers.CharField(allow_null=True)
    snapshot = serializers.CharField(allow_null=True)
    interface = serializers.CharField(allow_null=True)
    reserved = serializers.BooleanField()


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ApiErrorSerializer(serializers.Serializer):
    error = serializers.BooleanField()
    error_code = serializers.CharField()
    error_value = serializers.CharField()
    details = serializers.DictField(required=False)
