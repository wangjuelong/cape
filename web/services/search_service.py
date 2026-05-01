"""Search-page service layer.

Wraps upstream `lib.cuckoo.common.web_utils.perform_search` so v3 can
serve the same query that the legacy `/analysis/search/?search=…` view
serves, returning TaskSummary-shaped rows instead of raw Mongo / ES docs.

The prefix taxonomy mirrors what upstream's search.html template renders
in its collapsible help block — the SPA reuses this metadata to build
the same hint table without needing to scrape the upstream HTML.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from . import task_service

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prefix help table (mirrors upstream `templates/analysis/search.html`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SearchPrefix:
    prefix: str
    description: str
    group: str


SEARCH_PREFIXES: tuple[SearchPrefix, ...] = (
    # General & Metadata
    SearchPrefix("id", "Task ID (e.g., id:1)", "General & Metadata"),
    SearchPrefix("ids", "List of Task IDs (e.g., ids:1,2,3)", "General & Metadata"),
    SearchPrefix("options", "Task options (e.g., options:function=DllMain)", "General & Metadata"),
    SearchPrefix("tags_tasks", "Task tags (e.g., tags_tasks:mytag)", "General & Metadata"),
    SearchPrefix("package", "Analysis package (e.g., package:ps1)", "General & Metadata"),
    SearchPrefix("machinename", "Target Machine Name", "General & Metadata"),
    SearchPrefix("machinelabel", "Target Machine Label", "General & Metadata"),
    SearchPrefix("custom", "Custom data field", "General & Metadata"),
    SearchPrefix("comment", "Analysis Comments", "General & Metadata"),
    SearchPrefix("configs", "Extracted config value", "General & Metadata"),
    # File Properties & Static Analysis
    SearchPrefix("target_sha256", "Target file SHA256", "File Properties & Static Analysis"),
    SearchPrefix("name", "File name pattern", "File Properties & Static Analysis"),
    SearchPrefix("type", "File type/format", "File Properties & Static Analysis"),
    SearchPrefix("ssdeep", "Fuzzy hash (SSDeep)", "File Properties & Static Analysis"),
    SearchPrefix("crc32", "CRC32 hash", "File Properties & Static Analysis"),
    SearchPrefix("imphash", "PE Imphash", "File Properties & Static Analysis"),
    SearchPrefix("iconhash", "Exact icon hash", "File Properties & Static Analysis"),
    SearchPrefix("iconfuzzy", "Fuzzy icon hash", "File Properties & Static Analysis"),
    SearchPrefix("dhash", "Icon dhash", "File Properties & Static Analysis"),
    SearchPrefix("die", "Detect It Easy (DIE) signature (e.g., die:obsidium)", "File Properties & Static Analysis"),
    SearchPrefix("extracted_tool", "Extracted tool (e.g., InnoExtract)", "File Properties & Static Analysis"),
    SearchPrefix("virustotal", "VirusTotal Detected Name", "File Properties & Static Analysis"),
    SearchPrefix("clamav", "Local ClamAV detections", "File Properties & Static Analysis"),
    SearchPrefix("yaraname", "Yara Rule Name (binary folder)", "File Properties & Static Analysis"),
    SearchPrefix("capeyara", "Yara Rule Name (cape folder)", "File Properties & Static Analysis"),
    SearchPrefix("procdumpyara", "Yara Rule Name (process dumps)", "File Properties & Static Analysis"),
    SearchPrefix("procmemyara", "Yara Rule Name (memory dumps)", "File Properties & Static Analysis"),
    # Network Analysis
    SearchPrefix("ip", "Contacted IP address", "Network Analysis"),
    SearchPrefix("domain", "Contacted domain", "Network Analysis"),
    SearchPrefix("url", "Contacted URL or URL Analysis Target", "Network Analysis"),
    SearchPrefix("port", "Source or Destination port", "Network Analysis"),
    SearchPrefix("sport", "Source port", "Network Analysis"),
    SearchPrefix("dport", "Destination port", "Network Analysis"),
    SearchPrefix("ja3_string", "JA3 string", "Network Analysis"),
    SearchPrefix("ja3_hash", "JA3 hash", "Network Analysis"),
    SearchPrefix("asn", "AS ID (e.g., asn:AS15169)", "Network Analysis"),
    SearchPrefix("asn_name", "ASN name (e.g., asn_name:Google LLC)", "Network Analysis"),
    SearchPrefix("surimsg", "Suricata Alert Message", "Network Analysis"),
    SearchPrefix("surialert", "Suricata Alert Category", "Network Analysis"),
    SearchPrefix("surisid", "Suricata Alert SID", "Network Analysis"),
    SearchPrefix("suriurl", "Suricata HTTP URL", "Network Analysis"),
    SearchPrefix("suriua", "Suricata HTTP User-Agent", "Network Analysis"),
    SearchPrefix("surireferrer", "Suricata HTTP Referrer", "Network Analysis"),
    SearchPrefix("surihost", "Suricata HTTP Host", "Network Analysis"),
    SearchPrefix("suritlssubject", "Suricata TLS Subject", "Network Analysis"),
    SearchPrefix("suritlsissuerdn", "Suricata TLS Issuer DN", "Network Analysis"),
    SearchPrefix("suritlsfingerprint", "Suricata TLS Fingerprint", "Network Analysis"),
    SearchPrefix("suritls", "Suricata TLS Generic", "Network Analysis"),
    SearchPrefix("surihttp", "Suricata HTTP Generic", "Network Analysis"),
    # Behavior & Execution
    SearchPrefix("file", "Open files matching pattern", "Behavior & Execution"),
    SearchPrefix("command", "Executed commands matching pattern", "Behavior & Execution"),
    SearchPrefix("resolvedapi", "APIs resolved at runtime", "Behavior & Execution"),
    SearchPrefix("key", "Open registry keys matching pattern", "Behavior & Execution"),
    SearchPrefix("mutex", "Open mutexes matching pattern", "Behavior & Execution"),
    SearchPrefix("signame", "CAPE Signature names", "Behavior & Execution"),
    SearchPrefix("signature", "CAPE Signature descriptions", "Behavior & Execution"),
    SearchPrefix("detections", "Malware family detections", "Behavior & Execution"),
    SearchPrefix("malscore", "Malscore > value", "Behavior & Execution"),
    SearchPrefix("ttp", "TTP ID (e.g., T1053)", "Behavior & Execution"),
)


def list_search_prefixes() -> list[dict[str, str]]:
    return [{"prefix": p.prefix, "description": p.description, "group": p.group} for p in SEARCH_PREFIXES]


# ---------------------------------------------------------------------------
# Query parsing & execution
# ---------------------------------------------------------------------------


_SHORT_ALLOWED = {"malscore", "id", "ids", "package"}


@dataclass(frozen=True)
class SearchQuery:
    raw: str
    term: str
    value: Any


def _detect_hash_type(value: str) -> str | None:
    """Mirror upstream: when no prefix is provided, infer the hash family
    by length + character class so `8ed378…` is treated as sha256, etc."""
    first = value.split(",")[0].split(" ")[0] if value else ""
    if len(first) == 64 and re.match(r"^[a-fA-F0-9]{64}$", first):
        return "sha256"
    if len(first) == 32 and re.match(r"^[a-fA-F0-9]{32}$", first):
        return "md5"
    if len(first) == 40 and re.match(r"^[a-fA-F0-9]{40}$", first):
        return "sha1"
    if len(first) == 96 and re.match(r"^[a-fA-F0-9]{96}$", first):
        return "sha3"
    if len(first) == 128 and re.match(r"^[a-fA-F0-9]{128}$", first):
        return "sha512"
    return None


def parse_query(raw: str) -> SearchQuery:
    raw = raw.strip()
    if ":" in raw:
        prefix, value = raw.split(":", 1)
        term = prefix.lower().strip()
        value_str = value.lstrip()
    else:
        term = ""
        value_str = raw

    value: Any = value_str

    # Hash auto-detection (when no prefix)
    if not term:
        guessed = _detect_hash_type(value_str)
        if guessed:
            term = guessed
        else:
            value = value_str.lower()

    # Comma-separated id list
    if term == "ids":
        parts = [p.strip() for p in value_str.split(",") if p.strip()]
        if not all(p.isdigit() for p in parts):
            raise ValueError("Not all values are integers")
        value = [int(p) for p in parts]

    # Escape backslashes for Mongo regex safety (matches upstream)
    if isinstance(value, str):
        value = value.replace("\\", "\\\\")

    return SearchQuery(raw=raw, term=term, value=value)


@dataclass
class SearchResult:
    ok: bool
    term: str
    value: Any
    raw: str
    items: list[dict[str, Any]]
    error: str | None = None


def run_search(raw: str, *, user_id: int = 0, privs: bool = False) -> SearchResult:
    """Mirror upstream `web/analysis/views.py:search()` flow:

      1. Parse `raw` into (term, value).
      2. Enforce min-3-char rule (except malscore/id/ids/package).
      3. Call lib.cuckoo.common.web_utils.perform_search.
      4. Resolve each Mongo/ES result to a task_id, hydrate TaskSummary.
    """
    raw = (raw or "").strip()
    if not raw:
        return SearchResult(ok=True, term="", value="", raw="", items=[], error=None)

    try:
        q = parse_query(raw)
    except ValueError as exc:
        return SearchResult(ok=False, term="", value=raw, raw=raw, items=[], error=str(exc))

    value_for_len = q.value if isinstance(q.value, str) else (q.raw.split(":", 1)[1] if ":" in q.raw else q.raw)
    if q.term not in _SHORT_ALLOWED and isinstance(value_for_len, str) and len(value_for_len) < 3:
        return SearchResult(
            ok=False,
            term=q.term,
            value=q.value,
            raw=raw,
            items=[],
            error="Search term too short, minimum 3 characters required",
        )

    try:
        from lib.cuckoo.common.web_utils import perform_search
    except ImportError:
        return SearchResult(
            ok=False, term=q.term, value=q.value, raw=raw, items=[],
            error="Search engine unavailable on this deployment",
        )

    try:
        records = perform_search(q.term, q.value, user_id=user_id, privs=privs)
    except ValueError as exc:
        return SearchResult(
            ok=False, term=q.term, value=q.value, raw=raw, items=[],
            error=f"Invalid search term: {exc}" if q.term else "Unable to recognize the search syntax",
        )
    except Exception as exc:  # pragma: no cover — Mongo/ES connectivity
        log.warning("perform_search failed: %s", exc)
        return SearchResult(
            ok=False, term=q.term, value=q.value, raw=raw, items=[],
            error=f"Search backend error: {exc}",
        )

    if not records:
        return SearchResult(ok=True, term=q.term, value=q.value, raw=raw, items=[], error=None)

    # Each record may be either a Mongo doc (`info.id`) or an ES hit
    # (`_source.task_id`) — extract task_id either way.
    task_ids: list[int] = []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        info = rec.get("info") if rec.get("info") else None
        if isinstance(info, dict) and info.get("id") is not None:
            try:
                task_ids.append(int(info["id"]))
                continue
            except (TypeError, ValueError):
                pass
        src = rec.get("_source")
        if isinstance(src, dict):
            tid = src.get("task_id") or (src.get("info", {}) if isinstance(src.get("info"), dict) else {}).get("id")
            if tid is not None:
                try:
                    task_ids.append(int(tid))
                except (TypeError, ValueError):
                    pass

    # Dedupe while keeping order
    seen: set[int] = set()
    unique_ids: list[int] = []
    for tid in task_ids:
        if tid not in seen:
            seen.add(tid)
            unique_ids.append(tid)

    items: list[dict[str, Any]] = []
    for tid in unique_ids:
        summary = task_service.view_task(tid)
        if summary:
            items.append(summary)

    return SearchResult(ok=True, term=q.term, value=q.value, raw=raw, items=items, error=None)
