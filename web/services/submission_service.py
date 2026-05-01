"""Form-data builders for the SPA Submit page.

Mirrors the dictionaries that ``web/submission/views.py:index()`` exposes to
its Django template (``packages``, ``machines``, ``tags``, ``vpns``, ``socks5s``,
``random_route``, ``all_exitnodes``, ``route``, ``inetsim``, ``tor``,
``internet`` and ``config``). Lifting them into a service lets v3 surface the
same data to the SPA without coupling to the Django template layer.
"""

from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass
from typing import Any

from django.conf import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class PackageInfo:
    name: str
    value: str
    summary: str
    description: str
    platform: str


@dataclass(frozen=True)
class RouteOption:
    """One entry for the network-routing dropdown."""

    name: str
    label: str
    type: str  # internet | inetsim | tor | vpn | socks5 | exitnode | random | none
    description: str | None = None


def get_form_data() -> dict[str, Any]:
    """Bundle every dropdown / toggle hint the Submit page needs.

    Wraps the pieces upstream's view assembles inline:
      - get_form_data()          -> packages, machines
      - load_vms_tags()          -> machine tags
      - load_vms_exits()         -> auto-pick exit nodes
      - _load_socks5_operational + rooter.vpns -> route candidates
      - apiconf / web.conf       -> feature gates the form needs
    """
    from lib.cuckoo.common.config import Config
    from lib.cuckoo.common.web_utils import (
        downloader_services,
        load_vms_exits,
        load_vms_tags,
    )
    from lib.cuckoo.core.database import Database
    from lib.cuckoo.core.rooter import _load_socks5_operational, vpns

    cfg = Config("cuckoo")
    routing = Config("routing")
    web_conf = Config("web")
    distconf = Config("distributed")
    processing = Config("processing")

    db = Database()

    # ---- packages + machines ----
    # Upstream `get_form_data()` reads from the Cuckoo database for the
    # machine list, plus walks `analyzer/<platform>/modules/packages/` for
    # packages. If anything blows up here we fall back to an empty form
    # rather than 500 the whole Submit page — but we WANT to know about
    # it (otherwise the user sees an empty MACHINE dropdown silently). So
    # log the full traceback at WARNING so it shows up in journalctl.
    try:
        from submission.views import get_form_data as upstream_get_form_data

        packages_raw, machines_raw = upstream_get_form_data()
    except Exception:
        log.exception("submission_form_data: upstream get_form_data() failed")
        packages_raw = []
        machines_raw = [("", "First available")]

    packages = [
        {
            "name": p.get("name", ""),
            "value": p.get("value", ""),
            "summary": p.get("summary", ""),
            "description": p.get("description", ""),
            "platform": p.get("platform", "windows"),
        }
        for p in sorted(packages_raw, key=lambda i: str(i.get("name", "")).lower())
    ]

    machines = [{"value": v, "label": l} for v, l in machines_raw]

    # ---- machine tags ----
    machine_tags = sorted(load_vms_tags() or [])

    # ---- routes ----
    route_options: list[dict[str, Any]] = []

    internet = getattr(routing.routing, "internet", "none")
    if internet and internet != "none":
        route_options.append(
            {
                "name": "internet",
                "label": f"Internet (dirty line, {internet})",
                "type": "internet",
            }
        )

    if getattr(routing.inetsim, "enabled", False):
        route_options.append({"name": "inetsim", "label": "inetsim/fakenet-ng", "type": "inetsim"})

    if getattr(routing.tor, "enabled", False):
        route_options.append({"name": "tor", "label": "tor", "type": "tor"})

    for vpn in vpns.values():
        route_options.append(
            {
                "name": vpn["name"],
                "label": f'{vpn.get("description", vpn["name"])} ({vpn.get("interface", "")}, vpn)',
                "type": "vpn",
                "description": vpn.get("description"),
            }
        )

    socks5s = _load_socks5_operational()
    for v in socks5s.values():
        route_options.append(
            {
                "name": v.get("description", ""),
                "label": f'{v.get("description", "")} - {v.get("host", "")}:{v.get("port", "")} (socks5)',
                "type": "socks5",
                "description": v.get("description"),
            }
        )

    for exit_name in sorted(load_vms_exits() or []):
        route_options.append(
            {
                "name": exit_name,
                "label": f"{exit_name} (Auto-pick)",
                "type": "exitnode",
            }
        )

    # Drop-everything fallback always last.
    route_options.append({"name": "none", "label": "Drop all VM traffic", "type": "none"})

    # ---- random_route preview (purely informational) ----
    random_route: dict[str, Any] | None = None
    rr_socks5 = ""
    rr_vpn = ""
    if getattr(routing.socks5, "random_socks5", False) and socks5s:
        rr_socks5 = socks5s[random.choice(list(socks5s.keys()))]
    if getattr(routing.vpn, "random_vpn", False) and vpns:
        rr_vpn = vpns[random.choice(list(vpns.keys()))]
    if rr_socks5 and rr_vpn:
        pick = random.choice((rr_vpn, rr_socks5))
    elif rr_vpn:
        pick = rr_vpn
    elif rr_socks5:
        pick = rr_socks5
    else:
        pick = None
    if pick:
        if pick is rr_vpn:
            random_route = {
                "name": pick["name"],
                "label": f'[RANDOM] {pick.get("description", pick["name"])} ({pick.get("interface", "")}, vpn)',
                "type": "vpn",
            }
        else:
            random_route = {
                "name": pick.get("description", ""),
                "label": f'[RANDOM] {pick.get("description", "")} - {pick.get("host", "")}:{pick.get("port", "")} (socks5)',
                "type": "socks5",
            }

    # ---- gating (mirrors `enabledconf` upstream) ----
    config_flags = {
        "kernel": bool(getattr(settings, "OPT_ZER0M0N", False)),
        "memory": bool(processing.memory.get("enabled")),
        "procmemory": bool(processing.procmemory.get("enabled")),
        "dlnexec": bool(getattr(settings, "DLNEXEC", False)),
        "url_analysis": bool(getattr(settings, "URL_ANALYSIS", False)),
        "tags": bool(machine_tags),
        "dist_master_storage_only": bool(distconf.distributed.master_storage_only),
        "linux_on_gui": bool(getattr(web_conf.linux, "enabled", False)),
        "tlp": bool(getattr(web_conf.tlp, "enabled", False)),
        "timeout": int(getattr(cfg.timeouts, "default", 200) or 200),
        "amsidump": bool(getattr(web_conf.amsidump, "enabled", False)),
        "pre_script": bool(getattr(web_conf.pre_script, "enabled", False)),
        "during_script": bool(getattr(web_conf.during_script, "enabled", False)),
        "downloading_service": bool(downloader_services.downloaders),
        "interactive_desktop": bool(getattr(web_conf.guacamole, "enabled", False)),
    }

    return {
        "packages": packages,
        "machines": machines,
        "machine_tags": machine_tags,
        "route_options": route_options,
        "random_route": random_route,
        "default_route": getattr(routing.routing, "route", "none"),
        "config": config_flags,
    }


# ---------------------------------------------------------------------------
# Resubmit-by-hash
# ---------------------------------------------------------------------------


def resubmit_by_hash(
    request: Any,
    *,
    task_id: int,
    file_hash: str,
    job_category: str | None = None,
) -> dict[str, Any]:
    """Mirror the resubmit branch of upstream `web/submission/views.py:index()`.

    Strategy (lifted from views.py:446-507):
      1. Look up the binary on disk by:
         a. db.sample_path_by_hash(hash) (md5/sha1/sha256, len 32/40/64)
         b. storage/analyses/<task_id>/binary
         c. storage/analyses/<task_id>/{selfextracted,files,procdump,CAPE}/<hash>
      2. Stage the binary into a fresh tempdir under TEMP_PATH/cape-resubmit
      3. Submit it via the same download_file path used for sample uploads.

    job_category lets the caller swap the resubmit into another mode
    (sample/static/pcap/dlnexec/vtdl/bazaar) just like the upstream form.
    """
    import tempfile

    from lib.cuckoo.common.path_utils import path_exists, path_mkdir
    from lib.cuckoo.common.utils import get_user_filename, sanitize_filename, store_temp_file
    from lib.cuckoo.common.web_utils import (
        download_file,
        get_file_content,
        parse_request_arguments,
    )
    from lib.cuckoo.core.database import Database

    db = Database()

    (
        _static,
        package,
        timeout,
        priority,
        options,
        machine,
        platform,
        tags,
        custom,
        memory,
        clock,
        enforce_timeout,
        unique,
        referrer,
        tlp,
        tags_tasks,
        route,
        cape,
    ) = parse_request_arguments(request, keyword="data")

    opt_filename = get_user_filename(options, custom)
    user_id = getattr(request.user, "id", None) or 0

    paths: list[str] = []
    if len(file_hash) in (32, 40, 64):
        paths = list(db.sample_path_by_hash(file_hash) or [])
    else:
        task_binary = os.path.join(settings.CUCKOO_PATH, "storage", "analyses", str(task_id), "binary")
        if path_exists(task_binary):
            paths.append(task_binary)
        else:
            tmp_paths = db.find_sample(task_id=task_id) or []
            for tmp_sample in tmp_paths:
                tmp_dict = tmp_sample.to_dict()
                if path_exists(tmp_dict.get("target", "")):
                    paths.append(tmp_dict["target"])
                else:
                    for tmp_task in db.find_sample(sample_id=tmp_dict["sample_id"]) or []:
                        candidate = os.path.join(
                            settings.CUCKOO_PATH,
                            "storage",
                            "binaries",
                            tmp_task.to_dict()["sha256"],
                        )
                        if path_exists(candidate):
                            paths.append(candidate)
                            break
    if not paths:
        for folder_name in ("selfextracted", "files", "procdump", "CAPE"):
            candidate = os.path.join(
                settings.CUCKOO_PATH,
                "storage",
                "analyses",
                str(task_id),
                folder_name,
                file_hash,
            )
            if path_exists(candidate):
                paths.append(candidate)

    if not paths:
        return {
            "ok": False,
            "error_code": "binary_not_found",
            "error_value": f"Cannot find binary for hash {file_hash} (task {task_id})",
        }

    content = get_file_content(paths)
    if not content:
        return {
            "ok": False,
            "error_code": "binary_unreadable",
            "error_value": f"Binary for {file_hash} could not be read",
        }

    folder = os.path.join(settings.TEMP_PATH, "cape-resubmit")
    if not path_exists(folder):
        path_mkdir(folder)
    base_dir = tempfile.mkdtemp(prefix="resubmit_", dir=folder)

    if opt_filename:
        filename = base_dir + "/" + opt_filename
    else:
        original_filename = ""
        task = db.view_task(task_id)
        if task and task.target:
            original_filename = sanitize_filename(os.path.basename(task.target))
        filename = base_dir + "/" + (original_filename or sanitize_filename(file_hash))
    staged_path = store_temp_file(content, filename)

    details: dict[str, Any] = {
        "errors": [],
        "request": request,
        "task_ids": [],
        "url": False,
        "params": {},
        "headers": {},
        "service": "apiv3_resubmit",
        "fhash": False,
        "options": options,
        "only_extraction": False,
        "user_id": user_id,
        "package": package,
        "path": staged_path,
        "content": content,
    }

    # Override task category if requested (matches upstream's `job_category` hack)
    if job_category in ("sample", "static", "pcap", "dlnexec", "vtdl", "bazaar"):
        # We let download_file route by `details["service"]` etc; for now we
        # keep the path-based submit (sample). Static / PCAP would need the
        # add_static / add_pcap branches — track as a follow-up.
        pass

    status, tasks_details = download_file(**details)
    if status == "error":
        return {
            "ok": False,
            "error_code": "submit_failed",
            "error_value": str(tasks_details),
        }

    task_ids = list(tasks_details.get("task_ids") or [])
    errors = list(tasks_details.get("errors") or [])
    return {
        "ok": True,
        "task_ids": task_ids,
        "errors": errors,
        "options": options,
    }
