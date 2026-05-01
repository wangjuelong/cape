"""
apiv3 legacy bridge — wraps every apiv2 view function and re-exposes it
under `/api/v3/legacy/...` paths.

Why:
- Per project convention every new backend feature lands on apiv3, but
  apiv2 itself stays frozen for the existing token-auth client base.
- We still want apiv3 callers to have one consistent entry-point that
  speaks every operation upstream apiv2 already implements (binary
  downloads, status polling, reschedule, IOCs, etc) without re-coding
  any business logic.
- The wrappers below are *thin delegates* to ``apiv2.views.<fn>`` — they
  share the exact same Mongo / SQL / disk paths the legacy clients hit,
  so behaviour stays identical bit-for-bit.

What's NOT in here (already first-class apiv3 endpoints):
    /tasks/                /tasks/<id>/        /tasks/<id>/delete/
    /tasks/file/           /tasks/url/         /tasks/dlnexec/
    /tasks/download_services/                  /tasks/<id>/resubmit/<hash>/
    /reports/<id>/{summary,behavior,behavior/calls,behavior/search,
                   static,attack,config,network,dropped,payloads,
                   screenshots}/
    /machines/             /machines/<name>/   /statistics/<days>/
    /search/               /search/prefixes/   /compare/<a>/[<b>/]
    /system/{info,feature-flags,submission-form}/
    /events/tasks  (SSE)   /docs/  /schema/   /me/  /auth/csrf/

What this module ADDS (delegating to apiv2):

    Tasks ops:
        /legacy/tasks/create/static/      → tasks_create_static
        /legacy/tasks/reschedule/<id>/    → tasks_reschedule
        /legacy/tasks/reprocess/<id>/     → tasks_reprocess
        /legacy/tasks/status/<id>/        → tasks_status
        /legacy/tasks/delete_many/        → tasks_delete_many
        /legacy/tasks/get/stream/<id>/    → tasks_file_stream

    Hash-search shortcuts:
        /legacy/tasks/search/md5/<hash>/      → tasks_search
        /legacy/tasks/search/sha1/<hash>/     → tasks_search
        /legacy/tasks/search/sha256/<hash>/   → tasks_search
        /legacy/tasks/extendedsearch/         → ext_tasks_search

    Report download shortcuts (binary):
        /legacy/tasks/get/report/<id>/[<format>/[<make_zip>/]]
                                             → tasks_report
        /legacy/tasks/get/iocs/<id>/[detailed/]      → tasks_iocs
        /legacy/tasks/get/config/<id>/[<cape_name>/] → tasks_config
        /legacy/tasks/get/screenshot/<id>/[<n>/]     → tasks_screenshot
        /legacy/tasks/get/pcap/<id>/                 → tasks_pcap
        /legacy/tasks/get/tlspcap/<id>/              → tasks_tlspcap
        /legacy/tasks/get/evtx/<id>/                 → tasks_evtx
        /legacy/tasks/get/dropped/<id>/              → tasks_dropped
        /legacy/tasks/get/selfextracted/<id>/[<tool>/] → tasks_selfextracted
        /legacy/tasks/get/surifile/<id>/             → tasks_surifile
        /legacy/tasks/get/mitmdump/<id>/             → tasks_mitmdump
        /legacy/tasks/get/payloadfiles/<id>/         → tasks_payloadfiles
        /legacy/tasks/get/procdumpfiles/<id>/        → tasks_procdumpfiles
        /legacy/tasks/get/procmemory/<id>/[<pid>/]   → tasks_procmemory
        /legacy/tasks/get/fullmemory/<id>/           → tasks_fullmemory

    Files endpoints:
        /legacy/files/view/(md5|sha1|sha256|id)/<value>/   → files_view
        /legacy/files/get/(md5|sha1|sha256|task)/<value>/  → file (binary)

    System / misc:
        /legacy/cuckoo/status/        → cuckoo_status
        /legacy/exitnodes/            → exit_nodes_list
        /legacy/tasks/get/latests/<hours>/  → tasks_latest
        /legacy/tasks/stats/          → task_x_hours

Auth: each endpoint requires `IsAuthenticated` (DRF Session or Token).
The underlying apiv2 view enforces its own `api.conf [<endpoint>]` gating
on top — disabled endpoints still return 200 with `{error: true}` body.
"""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from apiv2 import views as v2


# ---------------------------------------------------------------------------
# Tasks ops
# ---------------------------------------------------------------------------


@extend_schema(tags=["legacy-tasks"], summary="Submit static-only analysis task.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_create_static(request: Request):
    return v2.tasks_create_static(request._request)


@extend_schema(tags=["legacy-tasks"], summary="Reschedule a finished task.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_reschedule(request: Request, task_id: int):
    return v2.tasks_reschedule(request._request, task_id)


@extend_schema(tags=["legacy-tasks"], summary="Re-run processing on an existing task.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_reprocess(request: Request, task_id: int):
    return v2.tasks_reprocess(request._request, task_id)


@extend_schema(tags=["legacy-tasks"], summary="Poll task status.")
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tasks_status(request: Request, task_id: int):
    return v2.tasks_status(request._request, task_id)


@extend_schema(tags=["legacy-tasks"], summary="Bulk-delete tasks.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_delete_many(request: Request):
    return v2.tasks_delete_many(request._request)


@extend_schema(tags=["legacy-tasks"], summary="Stream-style task status + report.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tasks_file_stream(request: Request, task_id: int):
    return v2.tasks_file_stream(request._request, task_id)


# ---------------------------------------------------------------------------
# Hash-search shortcuts
# ---------------------------------------------------------------------------


@extend_schema(tags=["legacy-search"], summary="Search tasks by md5.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_search_md5(request: Request, md5: str):
    return v2.tasks_search(request._request, md5=md5)


@extend_schema(tags=["legacy-search"], summary="Search tasks by sha1.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_search_sha1(request: Request, sha1: str):
    return v2.tasks_search(request._request, sha1=sha1)


@extend_schema(tags=["legacy-search"], summary="Search tasks by sha256.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_search_sha256(request: Request, sha256: str):
    return v2.tasks_search(request._request, sha256=sha256)


@extend_schema(tags=["legacy-search"], summary="Cross-store extended search.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ext_tasks_search(request: Request):
    return v2.ext_tasks_search(request._request)


# ---------------------------------------------------------------------------
# Report download shortcuts (binary)
# ---------------------------------------------------------------------------


@extend_schema(tags=["legacy-reports"], summary="Get raw report (json|html|pdf|all).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_report(request: Request, task_id: int, report_format: str = "json", make_zip: str | bool = False):
    return v2.tasks_report(request._request, task_id, report_format=report_format, make_zip=make_zip)


@extend_schema(tags=["legacy-reports"], summary="Extract IOCs from task report.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_iocs(request: Request, task_id: int, detail: str | None = None):
    return v2.tasks_iocs(request._request, task_id, detail=detail)


@extend_schema(tags=["legacy-reports"], summary="Extract malware config (optionally by family).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_config(request: Request, task_id: int, cape_name: str | bool = False):
    return v2.tasks_config(request._request, task_id, cape_name=cape_name)


@extend_schema(tags=["legacy-reports"], summary="Download task screenshot(s).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_screenshot(request: Request, task_id: int, screenshot: str = "all"):
    return v2.tasks_screenshot(request._request, task_id, screenshot=screenshot)


@extend_schema(tags=["legacy-reports"], summary="Download network PCAP.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_pcap(request: Request, task_id: int):
    return v2.tasks_pcap(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download decrypted TLS PCAP.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_tlspcap(request: Request, task_id: int):
    return v2.tasks_tlspcap(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download Windows EVTX log.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_evtx(request: Request, task_id: int):
    return v2.tasks_evtx(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download dropped files (zip).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_dropped(request: Request, task_id: int):
    return v2.tasks_dropped(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download self-extracted artifacts.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_selfextracted(request: Request, task_id: int, tool: str = "all"):
    return v2.tasks_selfextracted(request._request, task_id, tool=tool)


@extend_schema(tags=["legacy-reports"], summary="Download Suricata files.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_surifile(request: Request, task_id: int):
    return v2.tasks_surifile(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download mitmproxy HAR.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_mitmdump(request: Request, task_id: int):
    return v2.tasks_mitmdump(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download CAPE payloads (zip).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_payloadfiles(request: Request, task_id: int):
    return v2.tasks_payloadfiles(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download procdump files (zip).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_procdumpfiles(request: Request, task_id: int):
    return v2.tasks_procdumpfiles(request._request, task_id)


@extend_schema(tags=["legacy-reports"], summary="Download process-memory dump(s).")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_procmemory(request: Request, task_id: int, pid: str = "all"):
    return v2.tasks_procmemory(request._request, task_id, pid=pid)


@extend_schema(tags=["legacy-reports"], summary="Download full VM memory dump.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_fullmemory(request: Request, task_id: int):
    return v2.tasks_fullmemory(request._request, task_id)


# ---------------------------------------------------------------------------
# Files endpoints
# ---------------------------------------------------------------------------


@extend_schema(tags=["legacy-files"], summary="Sample lookup by md5.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def files_view_md5(request: Request, md5: str):
    return v2.files_view(request._request, md5=md5)


@extend_schema(tags=["legacy-files"], summary="Sample lookup by sha1.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def files_view_sha1(request: Request, sha1: str):
    return v2.files_view(request._request, sha1=sha1)


@extend_schema(tags=["legacy-files"], summary="Sample lookup by sha256.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def files_view_sha256(request: Request, sha256: str):
    return v2.files_view(request._request, sha256=sha256)


@extend_schema(tags=["legacy-files"], summary="Sample lookup by sample id.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def files_view_id(request: Request, sample_id: int):
    return v2.files_view(request._request, sample_id=sample_id)


@extend_schema(tags=["legacy-files"], summary="Download sample binary.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def file_download(request: Request, stype: str, value: str):
    return v2.file(request._request, stype=stype, value=value)


# ---------------------------------------------------------------------------
# System / misc
# ---------------------------------------------------------------------------


@extend_schema(tags=["legacy-system"], summary="Sandbox version + queue overview.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cuckoo_status(request: Request):
    return v2.cuckoo_status(request._request)


@extend_schema(tags=["legacy-system"], summary="List exit nodes from routing.conf.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exit_nodes_list(request: Request):
    return v2.exit_nodes_list(request._request)


@extend_schema(tags=["legacy-system"], summary="Tasks finished in the last <hours>.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tasks_latest(request: Request, hours: int):
    return v2.tasks_latest(request._request, hours)


@extend_schema(tags=["legacy-system"], summary="24h rolling task statistics.")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_x_hours(request: Request):
    return v2.task_x_hours(request._request)
