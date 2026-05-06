"""Serializers for apiv3 endpoints.

Field names mirror frontend/web-design/data.js (PRD D-14). Keep the contract
flat (e.g. signatures_count, yara_matches) rather than nested.
"""

from django.contrib.auth.models import User as _DjangoUser
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


# ---------------------------------------------------------------------------
# Auth / system
# ---------------------------------------------------------------------------


class CurrentUserSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.CharField(allow_null=True, allow_blank=True)
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    first_name = serializers.CharField(allow_blank=True, required=False)
    last_name = serializers.CharField(allow_blank=True, required=False)


class MeUpdateSerializer(serializers.Serializer):
    """Self-service profile update for /api/v3/me/ PATCH.

    Accepts only first_name / last_name / email. Any other field
    (username / is_staff / is_superuser / is_active / password / etc.)
    raises a validation error so the endpoint cannot be tricked into
    privilege escalation or password rotation.
    """

    first_name = serializers.CharField(
        required=False, max_length=150, allow_blank=True,
    )
    last_name = serializers.CharField(
        required=False, max_length=150, allow_blank=True,
    )
    email = serializers.EmailField(required=False)

    # Reject any unknown keys — DRF's default behaviour silently drops
    # them, which would let `{is_staff: true}` slip through unnoticed.
    def to_internal_value(self, data):
        allowed = {"first_name", "last_name", "email"}
        unknown = set(data.keys()) - allowed
        if unknown:
            raise serializers.ValidationError(
                {key: ["Unknown field; only first_name/last_name/email are allowed."]
                 for key in unknown}
            )
        return super().to_internal_value(data)


class ChangePasswordSerializer(serializers.Serializer):
    """Self-service password change for /api/v3/me/password/ POST.

    Validates: (1) current_password matches the stored hash; (2) new ==
    confirm; (3) Django AUTH_PASSWORD_VALIDATORS pass on new. Caller is
    responsible for invoking user.set_password() + user.save() after
    is_valid() — this class only validates."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["user"]
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        user = self.context["user"]
        try:
            validate_password(value, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        if attrs.get("new_password") != attrs.get("confirm_password"):
            raise serializers.ValidationError(
                {"confirm_password": ["New password and confirmation do not match."]}
            )
        return attrs


class CsrfTokenSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


# ---------------------------------------------------------------------------
# Admin user management — /api/v3/users/ + /api/v3/users/<id>/
# ---------------------------------------------------------------------------


class UserListSerializer(serializers.ModelSerializer):
    """Compact user row for /api/v3/users/ list endpoint."""

    has_token = serializers.SerializerMethodField()

    class Meta:
        model = _DjangoUser
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "is_active",
            "last_login", "date_joined",
            "has_token",
        )

    def get_has_token(self, obj) -> bool:
        from rest_framework.authtoken.models import Token
        return Token.objects.filter(user=obj).exists()


class UserSerializer(serializers.ModelSerializer):
    """Full user representation for /api/v3/users/<id>/ detail endpoint."""

    has_token = serializers.SerializerMethodField()

    class Meta:
        model = _DjangoUser
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "is_active",
            "last_login", "date_joined",
            "has_token",
        )

    def get_has_token(self, obj) -> bool:
        from rest_framework.authtoken.models import Token
        return Token.objects.filter(user=obj).exists()


class UserCreateSerializer(serializers.Serializer):
    """Admin-side user creation. Username must be unique; password must
    pass AUTH_PASSWORD_VALIDATORS. Non-superusers cannot create
    superusers."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_superuser = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        if _DjangoUser.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if attrs.get("is_superuser") and request and not request.user.is_superuser:
            raise serializers.ValidationError(
                {"is_superuser": ["Only superuser can create superuser."]}
            )
        return attrs


class UserUpdateSerializer(serializers.Serializer):
    """Admin-side user update. Username NOT editable.
    Excludes password (separate endpoint).
    is_staff is dropped — auto-synced to is_superuser by the view."""

    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_superuser = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def to_internal_value(self, data):
        allowed = {
            "email", "first_name", "last_name",
            "is_superuser", "is_active",
        }
        unknown = set(data.keys()) - allowed
        if unknown:
            raise serializers.ValidationError(
                {key: ["Field not editable; use dedicated endpoint or omit."]
                 for key in unknown}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        request = self.context.get("request")
        target = self.context.get("target")
        if attrs.get("is_superuser") and request and not request.user.is_superuser:
            raise serializers.ValidationError(
                {"is_superuser": ["Only superuser can promote."]}
            )
        if (
            "is_active" in attrs and attrs["is_active"] is False
            and request and target and request.user.id == target.id
        ):
            raise serializers.ValidationError(
                {"is_active": ["Cannot deactivate yourself."]}
            )
        return attrs


class UserSetPasswordSerializer(serializers.Serializer):
    """Admin-side password reset. No current_password required (admin
    override). Validates against AUTH_PASSWORD_VALIDATORS."""

    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


# ---------------------------------------------------------------------------
# API tokens — /api/v3/me/token/ + /api/v3/users/<id>/token/
# ---------------------------------------------------------------------------


class TokenSerializer(serializers.Serializer):
    """DRF authtoken payload returned by /me/token/ + /users/<id>/token/."""

    key = serializers.CharField(allow_null=True)
    created = serializers.DateTimeField(allow_null=True)


class SystemInfoSerializer(serializers.Serializer):
    cape_version = serializers.CharField()
    api_version = serializers.CharField()
    python_version = serializers.CharField()


class FeatureFlagsSerializer(serializers.Serializer):
    flags = serializers.DictField(child=serializers.BooleanField())


# ---------------------------------------------------------------------------
# Submission form metadata (mirrors web/submission/views.py:get_form_data())
# ---------------------------------------------------------------------------


class SubmissionPackageSerializer(serializers.Serializer):
    name = serializers.CharField()
    value = serializers.CharField()
    summary = serializers.CharField(allow_blank=True)
    description = serializers.CharField(allow_blank=True)
    platform = serializers.CharField()


class SubmissionMachineSerializer(serializers.Serializer):
    value = serializers.CharField(allow_blank=True)
    label = serializers.CharField()


class SubmissionRouteOptionSerializer(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.CharField()
    type = serializers.CharField()
    description = serializers.CharField(allow_null=True, required=False)


class SubmissionFormDataSerializer(serializers.Serializer):
    packages = SubmissionPackageSerializer(many=True)
    machines = SubmissionMachineSerializer(many=True)
    machine_tags = serializers.ListField(child=serializers.CharField())
    route_options = SubmissionRouteOptionSerializer(many=True)
    random_route = SubmissionRouteOptionSerializer(allow_null=True)
    default_route = serializers.CharField()
    config = serializers.DictField()


# ---------------------------------------------------------------------------
# Tasks — TaskSummarySerializer needs to be defined BEFORE the Compare /
# task-list serializers below, since they embed it as a child field. Class
# bodies execute at module load time, so a forward reference would raise
# NameError before Django can finish booting.
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


class CompareCandidatesResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    error_code = serializers.CharField(required=False, allow_null=True)
    error_value = serializers.CharField(required=False, allow_null=True)
    left = TaskSummarySerializer(allow_null=True)
    records = TaskSummarySerializer(many=True)
    md5 = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class CompareDiffResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    error_code = serializers.CharField(required=False, allow_null=True)
    error_value = serializers.CharField(required=False, allow_null=True)
    left = TaskSummarySerializer(allow_null=True, required=False)
    right = TaskSummarySerializer(allow_null=True, required=False)
    left_counts = serializers.DictField(child=serializers.FloatField(), required=False)
    right_counts = serializers.DictField(child=serializers.FloatField(), required=False)
    summary = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        required=False,
    )


class StatisticsTaskDaySerializer(serializers.Serializer):
    day = serializers.CharField()
    added = serializers.IntegerField()
    reported = serializers.IntegerField()
    failed = serializers.IntegerField()


class StatisticsModuleRowSerializer(serializers.Serializer):
    name = serializers.CharField()
    total = serializers.FloatField()
    runs = serializers.IntegerField()
    avg = serializers.FloatField()


class StatisticsTopSampleSerializer(serializers.Serializer):
    day = serializers.CharField()
    sha256 = serializers.CharField()
    count = serializers.IntegerField()


class StatisticsDetectionSerializer(serializers.Serializer):
    family = serializers.CharField()
    count = serializers.IntegerField()


class StatisticsAsnSerializer(serializers.Serializer):
    asn = serializers.CharField()
    count = serializers.IntegerField()


class StatisticsDistributedSerializer(serializers.Serializer):
    day = serializers.CharField()
    node = serializers.CharField()
    count = serializers.IntegerField()


class StatisticsResponseSerializer(serializers.Serializer):
    days = serializers.IntegerField()
    total = serializers.IntegerField()
    average = serializers.FloatField()
    tasks_per_day = StatisticsTaskDaySerializer(many=True)
    processing = StatisticsModuleRowSerializer(many=True)
    signatures = StatisticsModuleRowSerializer(many=True)
    reporting = StatisticsModuleRowSerializer(many=True)
    custom_statistics = StatisticsModuleRowSerializer(many=True)
    top_samples = StatisticsTopSampleSerializer(many=True)
    detections = StatisticsDetectionSerializer(many=True)
    asns = StatisticsAsnSerializer(many=True)
    distributed_tasks = StatisticsDistributedSerializer(many=True)
    error = serializers.CharField(allow_null=True, allow_blank=True)


class SearchPrefixSerializer(serializers.Serializer):
    prefix = serializers.CharField()
    description = serializers.CharField()
    group = serializers.CharField()


class SearchPrefixesResponseSerializer(serializers.Serializer):
    prefixes = SearchPrefixSerializer(many=True)


class SearchResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    term = serializers.CharField(allow_blank=True)
    value = serializers.JSONField(allow_null=True)
    raw = serializers.CharField(allow_blank=True)
    error = serializers.CharField(allow_null=True)
    items = TaskSummarySerializer(many=True)


class TaskResubmitSerializer(serializers.Serializer):
    package = serializers.CharField(required=False, allow_blank=True)
    timeout = serializers.IntegerField(required=False, min_value=0)
    priority = serializers.IntegerField(required=False, min_value=1, max_value=3)
    options = serializers.CharField(required=False, allow_blank=True)
    machine = serializers.CharField(required=False, allow_blank=True)
    platform = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.CharField(required=False, allow_blank=True)
    custom = serializers.CharField(required=False, allow_blank=True)
    memory = serializers.BooleanField(required=False)
    enforce_timeout = serializers.BooleanField(required=False)
    clock = serializers.CharField(required=False, allow_blank=True)
    referrer = serializers.CharField(required=False, allow_blank=True)
    tlp = serializers.CharField(required=False, allow_blank=True)
    tags_tasks = serializers.CharField(required=False, allow_blank=True)
    route = serializers.CharField(required=False, allow_blank=True)
    job_category = serializers.ChoiceField(
        choices=("sample", "static", "pcap", "dlnexec", "vtdl", "bazaar"),
        required=False,
    )


# ---------------------------------------------------------------------------
# TaskSummarySerializer + TaskListResponseSerializer + SEVERITY_CHOICES /
# VERDICT_CHOICES were moved earlier in this file (above
# CompareCandidatesResponseSerializer) to fix a forward-reference NameError
# at module load time. Other task-related serializers continue below.


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


class TaskDlnexecSubmitSerializer(serializers.Serializer):
    """``DL & Exec`` submission — host fetches the URL then runs the file."""
    dlnexec = serializers.URLField()
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
    tlp = serializers.CharField(required=False, allow_blank=True)
    tags_tasks = serializers.CharField(required=False, allow_blank=True)
    route = serializers.CharField(required=False, allow_blank=True)


class TaskDownloadServicesSubmitSerializer(serializers.Serializer):
    """Pull samples from VirusTotal / MalwareBazaar / etc by hash."""
    hashes = serializers.CharField(help_text="comma-separated hashes")
    options = serializers.CharField(required=False, allow_blank=True)
    custom = serializers.CharField(required=False, allow_blank=True)
    machine = serializers.CharField(required=False, allow_blank=True)


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


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


class SignatureLiteSerializer(serializers.Serializer):
    """Compact signature shape used by the Summary findings rail.

    Marks (per-API-call evidence) intentionally omitted; the full
    Signature shape is exposed under /api/v3/reports/<id>/signatures/.
    """

    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    severity = serializers.IntegerField()
    ttp = serializers.ListField(child=serializers.CharField())


class ReportSummarySerializer(serializers.Serializer):
    task = TaskSummarySerializer()
    available_sections = serializers.ListField(child=serializers.CharField())
    tab_counts = serializers.DictField()  # int | str values; Spectacular doesn't model unions cleanly
    signatures = SignatureLiteSerializer(many=True)
    score = serializers.FloatField(allow_null=True)
    severity = serializers.ChoiceField(choices=SEVERITY_CHOICES)
    verdict = serializers.ChoiceField(choices=VERDICT_CHOICES)
    family = serializers.CharField(allow_null=True)
    behavior_summary = serializers.DictField(required=False)
    # Upstream "Summary" tab cards — mirror analysis-details / machine-info
    # / file-info kv tables. Values are pre-stringified for direct render.
    analysis_info = serializers.DictField(child=serializers.CharField(), required=False)
    machine_info = serializers.DictField(child=serializers.CharField(), required=False)
    file_info = serializers.DictField(child=serializers.CharField(), required=False)
    # PE Information accordion (versioninfo / sections / imports / exports /
    # resources / overlay / misc). Empty for non-PE samples.
    pe_info = serializers.DictField(required=False)
    # Processing/signatures/reporting timing breakdown.
    statistics_processing = serializers.DictField(required=False)
    # Embedded files extracted from archives / overlay.
    subfiles = serializers.ListField(child=serializers.DictField(), required=False)
    # Combined YARA / CAPE-YARA / ClamAV matches against the target file.
    yara_matches = serializers.ListField(child=serializers.DictField(), required=False)
    # VirusTotal summary.
    virustotal = serializers.DictField(required=False)


class ProcessSummarySerializer(serializers.Serializer):
    pid = serializers.IntegerField(allow_null=True)
    ppid = serializers.IntegerField(allow_null=True)
    name = serializers.CharField(allow_blank=True)
    calls_count = serializers.IntegerField()
    chunk_count = serializers.IntegerField()
    # Upstream "process info banner" fields. Empty strings on Linux/non-PE
    # samples; the SPA hides empty rows.
    module_path = serializers.CharField(allow_blank=True, required=False)
    image_base = serializers.CharField(allow_blank=True, required=False)
    size = serializers.CharField(allow_blank=True, required=False)
    bitness = serializers.CharField(allow_blank=True, required=False)
    first_seen = serializers.CharField(allow_blank=True, required=False)
    environ = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)


class BehaviorSummaryResponseSerializer(serializers.Serializer):
    platform = serializers.CharField(allow_null=True)
    processtree = serializers.ListField()
    processes = ProcessSummarySerializer(many=True)
    detections2pid = serializers.DictField(required=False)


class ApiCallSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True, required=False)
    thread_id = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    category = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    api = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    status = serializers.BooleanField(allow_null=True, required=False)
    return_value = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    pretty_return = serializers.CharField(allow_blank=True, required=False)
    caller = serializers.CharField(allow_blank=True, required=False)
    parentcaller = serializers.CharField(allow_blank=True, required=False)
    repeated = serializers.IntegerField(required=False)
    timestamp = serializers.CharField(allow_null=True, required=False)
    arguments = serializers.ListField(child=serializers.DictField(), required=False)


class BehaviorCallsResponseSerializer(serializers.Serializer):
    calls = ApiCallSerializer(many=True)
    page = serializers.IntegerField()
    total_chunks = serializers.IntegerField()
    has_next = serializers.BooleanField()


# ---------------------------------------------------------------------------
# Static / ATT&CK / Config — passthrough payloads (schema is parser-defined,
# the SPA renders them as JSON trees).
# ---------------------------------------------------------------------------


class StaticReportSerializer(serializers.Serializer):
    static = serializers.DictField()
    target_file = serializers.DictField()


class AttackReportSerializer(serializers.Serializer):
    ttps = serializers.ListField()
    mitre_attck = serializers.ListField()


class ConfigReportSerializer(serializers.Serializer):
    malware_conf = serializers.ListField()


# ---------------------------------------------------------------------------
# Network / Dropped / Screenshots / Payloads — passthrough payloads.
# ---------------------------------------------------------------------------


class NetworkSuricataSerializer(serializers.Serializer):
    alerts = serializers.ListField()
    tls = serializers.ListField()
    http = serializers.ListField()
    files = serializers.ListField()


class NetworkReportSerializer(serializers.Serializer):
    hosts = serializers.ListField()
    domains = serializers.ListField()
    tcp = serializers.ListField()
    udp = serializers.ListField()
    icmp = serializers.ListField()
    smtp = serializers.ListField()
    irc = serializers.ListField()
    http = serializers.ListField()
    suricata = NetworkSuricataSerializer()


class DroppedReportSerializer(serializers.Serializer):
    dropped = serializers.ListField()


class PayloadsReportSerializer(serializers.Serializer):
    payloads = serializers.ListField()


class ScreenshotEntrySerializer(serializers.Serializer):
    index = serializers.IntegerField()
    url = serializers.CharField()
    thumbnail_url = serializers.CharField()


class ScreenshotsReportSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    shots = ScreenshotEntrySerializer(many=True)


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


class AuditEventActorSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(allow_null=True, required=False)
    username = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    ip = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    user_agent = serializers.CharField(allow_null=True, allow_blank=True, required=False)


class AuditEventTargetSerializer(serializers.Serializer):
    type = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    id = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    label = serializers.CharField(allow_null=True, allow_blank=True, required=False)


class AuditEventSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    timestamp = serializers.DateTimeField()
    actor = AuditEventActorSerializer()
    action = serializers.CharField()
    success = serializers.BooleanField()
    target = AuditEventTargetSerializer()
    metadata = serializers.DictField()


class AuditListResponseSerializer(serializers.Serializer):
    data = AuditEventSerializer(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class AuditActionDescriptorSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()
    category = serializers.CharField()


class AuditActionListResponseSerializer(serializers.Serializer):
    data = AuditActionDescriptorSerializer(many=True)


# ---------------------------------------------------------------------------
# Admin tokens list — flat row for /api/v3/tokens/
# ---------------------------------------------------------------------------


class TokenAdminListItemSerializer(serializers.Serializer):
    """One row of the admin /tokens/ aggregate list.

    Compatible with both annotated querysets (no `auth_token` relation
    materialised) and bare User instances — uses ``getattr`` fallback so
    the serializer stays usable from view + tests + future contexts.
    """

    user_id = serializers.IntegerField(source="id")
    username = serializers.CharField()
    email = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_active = serializers.BooleanField()
    has_token = serializers.SerializerMethodField()
    token_created = serializers.SerializerMethodField()
    key = serializers.SerializerMethodField()

    def _token(self, user):
        # ``auth_token`` is the OneToOne reverse accessor declared on
        # rest_framework.authtoken.models.Token. May raise
        # User.auth_token.RelatedObjectDoesNotExist if no token exists,
        # so guard with try/except — getattr alone won't catch it.
        try:
            return user.auth_token
        except Exception:
            return None

    def get_has_token(self, user) -> bool:
        return self._token(user) is not None

    def get_token_created(self, user):
        tok = self._token(user)
        return tok.created if tok else None

    def get_key(self, user):
        tok = self._token(user)
        return tok.key if tok else None
