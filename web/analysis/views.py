# Copyright (C) 2010-2015 Cuckoo Foundation.
# This file is part of Cuckoo Sandbox - http://www.cuckoosandbox.org
# See the file 'docs/LICENSE' for copying permission.

import base64
import os
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path
from wsgiref.util import FileWrapper

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_safe
from rest_framework.decorators import api_view

sys.path.append(settings.CUCKOO_PATH)

from lib.cuckoo.common.config import Config
from lib.cuckoo.common.constants import ANALYSIS_BASE_PATH, CUCKOO_ROOT
from lib.cuckoo.common.path_utils import path_exists, path_safe
from lib.cuckoo.common.pcap_utils import PcapToNg
from lib.cuckoo.common.utils import yara_detected
from lib.cuckoo.common.web_utils import (
    category_all_files,
    my_rate_minutes,
    my_rate_seconds,
    perform_search,
    rateblock,
    statistics,
)

try:
    from django_ratelimit.decorators import ratelimit
except ImportError:
    try:
        from ratelimit.decorators import ratelimit
    except ImportError:
        print("missed dependency: poetry install")

try:
    import requests

    HAVE_REQUEST = True
except ImportError:
    HAVE_REQUEST = False

try:
    import pyzipper

    HAVE_PYZIPPER = True
except ImportError:
    print("Missed dependency: poetry install")
    HAVE_PYZIPPER = False

reporting_cfg = Config("reporting")
integrations_cfg = Config("integrations")
web_cfg = Config("web")

USE_SEVENZIP = False
SEVENZIP_PATH = ""
if reporting_cfg.compression.compressiontool == "7zip":
    USE_SEVENZIP = True
    SEVENZIP_PATH = reporting_cfg.compression.sevenzippath.strip() or "/usr/bin/7z"

# Used for displaying enabled config options in Django UI
enabledconf = {}
for cfile in ("integrations", "reporting", "processing", "auxiliary", "web", "distributed"):
    curconf = Config(cfile)
    confdata = curconf.get_config()
    for item in confdata:
        if "enabled" in confdata[item]:
            if confdata[item]["enabled"] == "yes":
                enabledconf[item] = True
            else:
                enabledconf[item] = False

anon_not_viewable_func_list = (
    "file",
    "remove",
    # "search",
    "pending",
    "filtered_chunk",
    "search_behavior",
    "statistics_data",
)


# Conditional decorator for web authentication
class conditional_login_required:
    def __init__(self, dec, condition):
        self.decorator = dec
        self.condition = condition

    def __call__(self, func):
        if settings.ANON_VIEW and func.__name__ not in anon_not_viewable_func_list:
            return func
        if not self.condition:
            return func
        return self.decorator(func)


def _path_safe(path: str) -> bool:
    if web_cfg.security.check_path_safe:
        return path_safe(path)

    return True


zip_categories = (
    "staticzip",
    "droppedzip",
    "CAPEzip",
    "procdumpzip",
    "memdumpzip",
    "networkzip",
    "pcapzip",
    "droppedzipall",
    "procdumpzipall",
    "CAPEzipall",
    "capeyarazipall",
    "logszipall",
)
category_map = {
    "CAPE": "CAPE",
    "procdump": "procdump",
    "dropped": "files",
}


def _file_search_all_files(search_category: str, search_term: str) -> list:
    path = []
    try:
        projection = {
            "info.parent_sample.path": 1,
            "info.parent_sample.cape_yara.name": 1,
            "target.file.path": 1,
            "target.file.cape_yara.name": 1,
            "dropped.path": 1,
            "dropped.cape_yara.name": 1,
            "procdump.path": 1,
            "procdump.cape_yara.name": 1,
            "CAPE.payloads.path": 1,
            "CAPE.payloads.cape_yara.name": 1,
            "info.parent_sample.extracted_files_tool.path": 1,
            "info.parent_sample.extracted_files_tool.cape_yara.name": 1,
            "target.file.extracted_files_tool.path": 1,
            "target.file.extracted_files_tool.cape_yara.name": 1,
            "dropped.extracted_files_tool.path": 1,
            "dropped.extracted_files_tool.cape_yara.name": 1,
            "procdump.extracted_files_tool.path": 1,
            "procdump.extracted_files_tool.cape_yara.name": 1,
            "CAPE.payloads.extracted_files_tool.path": 1,
            "CAPE.payloads.extracted_files_tool.cape_yara.name": 1,
        }
        records = perform_search(search_category, search_term, projection=projection)
        search_term = search_term.lower()
        for _, filepath, _, _ in yara_detected(search_term, records):
            if not path_exists(filepath):
                continue
            path.append(filepath)
    except ValueError as e:
        print("mongodb load", e)

    # remove any duplicated before return
    return list(set(path))


@require_safe
@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
@csrf_exempt
@ratelimit(key="ip", rate=my_rate_seconds, block=rateblock)
@ratelimit(key="ip", rate=my_rate_minutes, block=rateblock)
@api_view(["GET"])
def file(request, category, task_id, dlfile):
    file_name = dlfile
    cd = "application/octet-stream"
    path = ""
    mem_zip = False
    extmap = {
        "memdump": ".dmp",
        "memdumpstrings": ".dmp.strings",
    }

    if category in zip_categories and not HAVE_PYZIPPER:
        return render(request, "error.html", {"error": "Missed pyzipper library: poetry install"})

    if category in ("sample", "static", "staticzip"):
        path = os.path.join(CUCKOO_ROOT, "storage", "binaries", file_name)
    elif category in ("dropped", "droppedzip"):
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(task_id), "files", file_name)
        # Self Extracted support folder
        if not path_exists(path):
            path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(task_id), "selfextracted", file_name)
    elif category in ("droppedzipall", "procdumpzipall", "CAPEzipall"):
        if web_cfg.zipped_download.download_all:
            sub_cat = category.replace("zipall", "")
            path = category_all_files(
                task_id, sub_cat, os.path.join(CUCKOO_ROOT, "storage", "analyses", str(task_id), category_map[sub_cat])
            )
            file_name = f"{task_id}_{category}"
    elif category.startswith("CAPE"):
        buf = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "CAPE", file_name)
        if os.path.isdir(buf):
            dfile = min(os.listdir(buf), key=len)
            path = os.path.join(buf, dfile)
        else:
            path = buf
            if not path_exists(path):
                path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(task_id), "selfextracted", file_name)
    elif category == "networkzip":
        buf = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "network", file_name)
        path = buf
    elif category.startswith("memdumpzip"):
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "memory", file_name + ".dmp")
        file_name += ".dmp"
    elif category == "pcap":
        file_name += ".pcap"
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "dump.pcap")
        cd = "application/vnd.tcpdump.pcap"
    elif category == "pcapzip":
        analysis_dir = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id)
        pcap_files = [
            ("dump.pcap", os.path.join(analysis_dir, "dump.pcap")),
            ("dump_decrypted.pcap", os.path.join(analysis_dir, "dump_decrypted.pcap")),
            ("dump_mixed.pcap", os.path.join(analysis_dir, "dump_mixed.pcap")),
            ("sslproxy.pcap", os.path.join(analysis_dir, "sslproxy", "sslproxy.pcap")),
            ("sslproxy_clean.pcap", os.path.join(analysis_dir, "sslproxy", "sslproxy_clean.pcap")),
        ]
        path = [p for _, p in pcap_files if path_exists(p) and os.path.getsize(p) > 0]
        if not path:
            path = os.path.join(analysis_dir, "dump.pcap")
        cd = "application/zip"
    elif category == "pcapng":
        analysis_path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id)
        pcap_path = os.path.join(analysis_path, "dump.pcap")
        tls_log_path = os.path.join(analysis_path, "tlsdump", "tlsdump.log")
        ssl_key_log_path = os.path.join(analysis_path, "aux", "sslkeylogfile", "sslkeys.log")
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "dump.pcapng")
        pcapng = PcapToNg(pcap_path, tls_log_path, ssl_key_log_path)
        pcapng.generate(path)
        file_name += ".pcapng"
        cd = "application/vnd.tcpdump.pcap"
    elif category == "decrypted_pcap":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "dump_decrypted.pcap")
        file_name += ".pcap"
        cd = "application/vnd.tcpdump.pcap"
    elif category == "mixed_pcap":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "dump_mixed.pcap")
        file_name += ".pcap"
        cd = "application/vnd.tcpdump.pcap"
    elif category == "debugger_log":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "debugger", str(dlfile) + ".log")
    elif category == "rtf":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "rtf_objects", file_name)
    elif category == "usage":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "aux", "usage.svg")
        file_name = "usage.svg"
        cd = "image/svg+xml"
    elif category in extmap:
        file_name += extmap[category]
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "memory", file_name)
        if not path_exists(path):
            file_name += ".zip"
            path += ".zip"
            cd = "application/zip"
    elif category == "dropped":
        buf = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "files", file_name)
        if os.path.isdir(buf):
            dfile = min(os.listdir(buf), key=len)
            path = os.path.join(buf, dfile)
        else:
            path = buf
    elif category.startswith("procdump"):
        buf = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "procdump", file_name)
        if os.path.isdir(buf):
            dfile = min(os.listdir(buf), key=len)
            path = os.path.join(buf, dfile)
        else:
            path = buf
    # Just for suricata dropped files currently
    elif category == "zip":
        file_name = "files.zip"
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "logs", "files.zip")
        cd = "application/zip"
    elif category == "suricata":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "logs", "files", file_name)
    elif category == "rtf":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "rtf_objects", file_name)
    elif category == "tlskeys":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "tlsdump", "tlsdump.log")
    # linux sysmon url to download sysmon.data xml
    elif category == "sysmon":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "sysmon", "sysmon.data")
    elif category == "evtx":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "evtx", "evtx.zip")
        file_name = f"{task_id}_evtx.zip"
        cd = "application/zip"
    elif category == "capeyarazipall":
        # search in mongo and get the path
        if enabledconf["mongodb"] and web_cfg.zipped_download.download_all:
            path = _file_search_all_files(category.replace("zipall", ""), dlfile)
    elif category == "logszipall":
        buf = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "logs")
        path = []
        for dfile in os.listdir(buf):
            path.append(os.path.join(buf, dfile))
    elif category == "mitmdump":
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, "mitmdump", "dump.har")
        cd = "text/plain"
    else:
        return render(request, "error.html", {"error": "Category not defined"})

    if not isinstance(path, list):
        send_filename = f"{task_id + '_' if task_id not in os.path.basename(path) else ''}{os.path.basename(path)}"
        if category in zip_categories:
            send_filename += ".zip"
    else:
        send_filename = file_name + ".zip"

    if not path:
        return render(
            request,
            "error.html",
            {"error": "Files not found or option is not enabled in conf/web.conf -> [zipped_download] -> download_all"},
        )

    test_path = path
    if isinstance(path, list):
        test_path = path[0]

    if test_path and (not path_exists(test_path) or not _path_safe(test_path)):
        return render(request, "error.html", {"error": "File {} not found".format(os.path.basename(test_path))})

    try:
        if category in zip_categories:
            if not isinstance(path, list):
                path = [path]
            if USE_SEVENZIP:
                zip_path = os.path.join(CUCKOO_ROOT, "storage", "analyses", f"{task_id}", f"{file_name}.zip")
                sevenZipArgs = [SEVENZIP_PATH, f"-p{settings.ZIP_PWD.decode()}", "a", zip_path]
                sevenZipArgs.extend(path)
                try:
                    subprocess.check_call(sevenZipArgs)
                except subprocess.CalledProcessError:
                    return render(request, "error.html", {"error": "error compressing file"})
                zip_fd = open(zip_path, "rb")
                resp = StreamingHttpResponse(zip_fd, content_type="application/zip")
                resp["Content-Length"] = os.path.getsize(zip_path)
                resp["Content-Disposition"] = f"attachment; filename={file_name}.zip"
                return resp
            else:
                mem_zip = BytesIO()
                with pyzipper.AESZipFile(mem_zip, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
                    zf.setpassword(settings.ZIP_PWD)
                    if not isinstance(path, list):
                        path = [path]
                    for file in path:
                        with open(file, "rb") as f:
                            zf.writestr(os.path.basename(file), f.read())
                mem_zip.seek(0)
                resp = StreamingHttpResponse(mem_zip, content_type=cd)
                resp["Content-Length"] = len(mem_zip.getvalue())
                file_name += ".zip"
                path = os.path.join(tempfile.gettempdir(), file_name)
                cd = "application/zip"
        else:
            resp = StreamingHttpResponse(FileWrapper(open(path, "rb"), 8091), content_type=cd)
            resp["Content-Length"] = Path(path).stat().st_size
        resp["Content-Disposition"] = f"attachment; filename={send_filename}"
        return resp
    except Exception as e:
        print(e)
        return render(request, "error.html", {"error": "File {} not found".format(os.path.basename(path))})


@require_safe
@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def filereport(request, task_id, category):
    # check if allowed to download to all + if no if user has permissions
    if not settings.ALLOW_DL_REPORTS_TO_ALL and (
        request.user.is_anonymous
        or (
            hasattr(request.user, "userprofile")
            and hasattr(request.user.userprofile, "reports")
            and not request.user.userprofile.reports
        )
    ):
        return render(
            request,
            "error.html",
            {"error": "You don't have permissions to download reports. Ask admin to enable it for you in user profile."},
        )

    formats = {
        "protobuf": "report.protobuf",
        "json": "report.json",
        "html": "report.html",
        "htmlsummary": "summary-report.html",
        "pdf": "report.pdf",
        "maec": "report.maec-4.1.xml",
        "maec5": "report.maec-5.0.json",
        "metadata": "report.metadata.xml",
        "misp": "misp.json",
        "litereport": "lite.json",
        "cents": "cents.rules",
    }

    if category in formats:
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(task_id), "reports", formats[category])

        if not _path_safe(path) or not path_exists(path):
            return render(request, "error.html", {"error": f"File not found: {formats[category]}"})

        response = HttpResponse(Path(path).read_bytes(), content_type="application/octet-stream")
        response["Content-Disposition"] = f"attachment; filename={task_id}_{formats[category]}"
        return response

    return render(request, "error.html", {"error": "File not found"}, status=404)


@require_safe
@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def full_memory_dump_file(request, analysis_number):
    filename = False
    for name in ("memory.dmp", "memory.dmp.zip"):
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(analysis_number), name)
        if path_exists(path) and _path_safe(path):
            filename = name
            break

    if filename:
        content_type = "application/octet-stream"
        response = StreamingHttpResponse(FileWrapper(open(path, "rb"), 8192), content_type=content_type)
        response["Content-Length"] = os.path.getsize(path)
        response["Content-Disposition"] = f"attachment; filename={filename}"
        return response

    return render(request, "error.html", {"error": "File not found"})


@require_safe
@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def full_memory_dump_strings(request, analysis_number):
    filename = None
    for name in ("memory.dmp.strings", "memory.dmp.strings.zip"):
        path = os.path.join(CUCKOO_ROOT, "storage", "analyses", str(analysis_number), name)
        if path_exists(path):
            filename = name
            if not _path_safe(ANALYSIS_BASE_PATH):
                return render(request, "error.html", {"error": f"File not found: {name}"})
            break
    if filename:
        content_type = "application/octet-stream"
        response = StreamingHttpResponse(FileWrapper(open(path), 8192), content_type=content_type)
        response["Content-Length"] = os.path.getsize(path)
        response["Content-Disposition"] = "attachment; filename=%s" % filename
        return response

    return render(request, "error.html", {"error": "File not found"})


@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def vtupload(request, category, task_id, filename, dlfile):
    if enabledconf["vtupload"] and integrations_cfg.virustotal.apikey:
        try:
            folder_name = False
            path = False
            if category in ("sample", "static"):
                path = os.path.join(CUCKOO_ROOT, "storage", "binaries", dlfile)
            elif category == "dropped":
                folder_name = "files"
            elif category in ("CAPE", "procdump"):
                folder_name = category

            if folder_name:
                path = os.path.join(CUCKOO_ROOT, "storage", "analyses", task_id, folder_name, filename)

            if not path or not _path_safe(path):
                return render(request, "error.html", {"error": f"File not found: {os.path.basename(path)}"})

            headers = {"x-apikey": integrations_cfg.virustotal.apikey}
            files = {"file": (filename, open(path, "rb"))}
            response = requests.post("https://www.virustotal.com/api/v3/files", files=files, headers=headers)
            if response.ok:
                id = response.json().get("data", {}).get("id")
                if id:
                    hashbytes, _ = base64.b64decode(id).split(b":")
                    md5hash = hashbytes.decode()
                    return render(
                        request, "success_vtup.html", {"permalink": "https://www.virustotal.com/gui/file/{id}".format(id=md5hash)}
                    )
            else:
                return render(
                    request, "error.html", {"error": "Response code: {} - {}".format(response.status_code, response.reason)}
                )
        except Exception as err:
            return render(request, "error.html", {"error": err})


@conditional_login_required(login_required, settings.WEB_AUTHENTICATION)
def statistics_data(request, days=7):
    if days.isdigit():
        try:
            details = statistics(int(days))
        except Exception as e:
            # psycopg2.OperationalError
            print(e)
            return render(
                request,
                "error.html",
                {"title": "Statistics", "error": "Please restart your database. Probably it had an update or it just down"},
            )
        return render(request, "statistics.html", {"title": "Statistics", "statistics": details, "days": days})
    return render(request, "error.html", {"title": "Statistics", "error": "Provide days as number"})
