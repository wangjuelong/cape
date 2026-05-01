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


class ProcessSummarySerializer(serializers.Serializer):
    pid = serializers.IntegerField(allow_null=True)
    ppid = serializers.IntegerField(allow_null=True)
    name = serializers.CharField(allow_blank=True)
    calls_count = serializers.IntegerField()
    chunk_count = serializers.IntegerField()


class BehaviorSummaryResponseSerializer(serializers.Serializer):
    platform = serializers.CharField(allow_null=True)
    processtree = serializers.ListField()
    processes = ProcessSummarySerializer(many=True)


class ApiCallSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True, required=False)
    thread_id = serializers.IntegerField(allow_null=True, required=False)
    category = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    api = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    status = serializers.IntegerField(allow_null=True, required=False)
    return_value = serializers.CharField(allow_null=True, required=False)
    timestamp = serializers.CharField(allow_null=True, required=False)
    arguments = serializers.ListField(required=False)


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
