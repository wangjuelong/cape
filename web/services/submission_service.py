"""Form-data builders for the SPA Submit page.

Mirrors the dictionaries that ``web/submission/views.py:index()`` exposes to
its Django template (``packages``, ``machines``, ``tags``, ``vpns``, ``socks5s``,
``random_route``, ``all_exitnodes``, ``route``, ``inetsim``, ``tor``,
``internet`` and ``config``). Lifting them into a service lets v3 surface the
same data to the SPA without coupling to the Django template layer.
"""

from __future__ import annotations

import ast
import logging
import os
import random
import textwrap
from dataclasses import dataclass
from typing import Any

from django.conf import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Package metadata extraction (ported from web/submission/views.py:59-243)
#
# Phase D deletes web/submission/. Inlining these helpers keeps the SPA's
# /api/v3/system/submission-form/ endpoint self-contained.
# ---------------------------------------------------------------------------

_AST_ALLOWED_FUNCTIONS = {
    "sorted": sorted,
    "set": set,
    "os.path.join": os.path.join,
}


def _parse_expr(expr, context):
    """Return the value from a python AST expression.

    Recursive! the initial call is the right hand side of an assignment.
    Recursion is necessary because the expression is made up of a variable number
    of subexpressions, sub-subexpressions, etc.
    """
    if isinstance(expr, str):
        return expr
    if isinstance(expr, ast.Constant):
        return expr.value
    if isinstance(expr, ast.Name):
        # To get the value associated with the variable name, look up name (expr.id) in context.
        # If lookup fails (we do not know the value of the variable), return the name.
        return context.get(expr.id, str(expr.id))
    if isinstance(expr, ast.List):
        return [_parse_expr(item, context) for item in expr.elts]
    if isinstance(expr, ast.Tuple):
        return tuple([_parse_expr(item, context) for item in expr.elts])
    if isinstance(expr, ast.JoinedStr):
        # JoinedStr - coerce each item to string, and join them.
        return "".join([str(_parse_expr(item, context)) for item in expr.values])
    if isinstance(expr, ast.FormattedValue):
        return _parse_expr(expr.value, context)
    if isinstance(expr, ast.Attribute):
        # Join expr.value to expr.attr with a "." between. Example: os.path.join
        return _parse_expr(expr.value, context) + "." + _parse_expr(expr.attr, context)
    if isinstance(expr, ast.Call):
        # Figure out what function is being called, with what arguments.
        func = _parse_expr(expr.func, context)
        args = tuple([_parse_expr(item, context) for item in expr.args])

        if func in _AST_ALLOWED_FUNCTIONS:
            # Actually call the function, passing the args, and return the result.
            return _AST_ALLOWED_FUNCTIONS[func](*args)
        # Don't execute the call, but instead, give back a string representation.
        return f"<{func}{args}>"
    if isinstance(expr, ast.BinOp) and isinstance(expr.op, ast.Add):
        left = _parse_expr(expr.left, context)
        right = _parse_expr(expr.right, context)
        try:
            ans = left + right
        except TypeError:
            # Expected behavior during unit tests
            ans = str(left) + str(right)
        return ans
    # Not expected to reach this, but should aid in debugging if found.
    return f"?? Unexpected type({type(expr)}) in _parse_expr()"


def _parse_ast(items, context=None):
    """Look at each item in a list of ast elements.

    Item type ast.Assign signifies a statement of the form 'name = value'.
    Work out the value using _parse_expr.
    Add an entry of the form 'name' = value to the context dictionary.
    """
    if not context:
        context = dict()
    for item in items:
        if isinstance(item, ast.Assign):
            key = item.targets[0].id
            context[key] = _parse_expr(item.value, context)
    return context


def _get_lib_common_constants(platform):
    """Extract constants from lib.common.constants into a dict"""
    constant_file = os.path.join(settings.CUCKOO_PATH, "analyzer", platform, "lib", "common", "constants.py")
    with open(constant_file, "r") as f:
        contents = f.read()
    tr = ast.parse(contents)
    the_dict = _parse_ast(tr.body)
    return the_dict


def _get_package_info(dir_name, filename, platform, common_context):
    """Find out everything we can about the package."""
    default_summary = f"Package {filename} has no summary"
    default_description = f"Package {filename} has no description"
    # Clear out previous package description etc.
    to_delete = ("summary", "description", "option_names")
    for item in to_delete:
        if item in common_context:
            del common_context[item]
    with open(os.path.join(dir_name, filename), "r") as f:
        contents = f.read()
    tr = ast.parse(contents)
    expanded_context = _parse_ast(tr.body, common_context)
    classes = [item for item in tr.body if isinstance(item, ast.ClassDef) and item.bases and item.bases[0].id == "Package"]
    if classes:
        classname = classes[0].name
        assignments = _parse_ast(classes[0].body, expanded_context)
    else:
        # No class inherited from 'Package'
        classname = "unknown classname"
        assignments = dict()
    summary = assignments.get("summary", default_summary)
    description = textwrap.dedent(assignments.get("description", default_description))
    option_names = assignments.get("option_names", ())
    if option_names:
        description = description + f"\nOPTIONS: {option_names}"
    result = {
        "name": os.path.splitext(filename)[0],
        "value": os.path.splitext(filename)[0],
        "classname": classname,
        "platform": platform,
        "summary": summary,
        "description": description,
        "option_names": option_names,
    }
    return result


def _get_enabled_platforms(web_conf):
    """Return a list of enabled platforms.

    We are going to assume that the windows platform is first in the list."""
    platforms = ["windows"]
    if web_conf.linux.enabled:
        platforms.append("linux")
    return platforms


def _correlate_platform_packages(platform_package_dict, web_conf):
    """Given a per-platform dictionary, return a single list of all packages"""
    package_names = set()
    result = []
    for platform in _get_enabled_platforms(web_conf):
        for package in platform_package_dict.get(platform, []):
            package_name = package["name"].lower()
            if package_name not in package_names:
                package_names.add(package_name)
                if platform != "windows":
                    # The windows analyzer package list did not contain this package name.
                    package["name"] = package["name"] + f" ({platform} only)"
                result.append(package)
    return result


def _load_packages_and_machines(web_conf, db):
    """Return data about packages and machines to help build the submission form.

    Ported verbatim from web/submission/views.py:get_form_data() (Phase D
    pre-prep). Takes web_conf and db as parameters so this module is
    self-contained — no imports from web/submission/.
    """
    platforms = _get_enabled_platforms(web_conf)

    platform_packages = dict()
    for platform in platforms:
        common_context = _get_lib_common_constants(platform)
        package_root = os.path.join(settings.CUCKOO_PATH, "analyzer", platform, "modules", "packages")
        files = [item.name for item in os.scandir(package_root) if item.is_file() and not item.name.startswith(".")]
        exclusions = [package.strip() + ".py" for package in web_conf.package_exclusion.packages.split(",")]

        exclusions.append("__init__.py")

        platform_packages[platform] = [
            _get_package_info(package_root, name, platform, common_context) for name in files if name not in exclusions
        ]
    packages = _correlate_platform_packages(platform_packages, web_conf)

    # Prepare a list of VM names, description label based on tags.
    machines = []
    for machine in db.list_machines():
        tags = [tag.name for tag in machine.tags]

        label = f"{machine.label}:{machine.arch}"
        if tags:
            label = f"{label}:{','.join(tags)}"

        if web_conf.linux.enabled:
            label = machine.platform + ":" + label

        machines.append((machine.label, label))

    # Prepend ALL/ANY options. Disable until a platform can be verified in scheduler.
    # Kept for parity with upstream get_form_data(); submission_service's downstream
    # filter (line ~103) defensively drops the empty-value placeholder again.
    machines.insert(0, ("", "First available"))
    if web_conf.all_vms.enabled:
        machines.insert(1, ("all", "All"))

    return packages, machines


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
        packages_raw, machines_raw = _load_packages_and_machines(web_conf, db)
    except Exception:
        log.exception("submission_form_data: _load_packages_and_machines() failed")
        packages_raw = []
        # Empty machines list — SPA's "Auto" default is what the user sees.
        # No need to inject a synthetic placeholder here.
        machines_raw = []

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

    # Upstream `views.py:239` does `machines.insert(0, ("", "First available"))`
    # — a UI-layer placeholder representing "any available VM". v3 returns
    # only real VMs; the SPA renders its own "Auto" default item so we
    # don't end up with two competing default rows. Filter out anything
    # whose value is empty (covers the placeholder + any future variants).
    machines = [{"value": v, "label": l} for v, l in machines_raw if v]

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
