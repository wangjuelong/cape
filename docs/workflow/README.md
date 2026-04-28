# HTTP-only Sample Analysis Workflow

This directory documents how to drive a complete CAPE sandbox analysis —
from sample submission to retrieval of the JSON report and binary
artefacts — using **only the REST API at `/apiv2/`**. It is self-contained
and not part of the Sphinx book under `docs/book/`.

Files:

- `README.md` — this guide (endpoint reference + minimal client).
- `run_analysis.sh` — a standalone bash script that executes the full
  workflow end-to-end.

The intended audience is internal teams or private deployments that want
to integrate CAPE programmatically without the web UI or the
`utils/submit.py` CLI.

## Scope

A client can perform the **entire analysis lifecycle** over HTTP:

1. Authenticate (one-time, gets a token).
2. Submit a file or URL.
3. Poll task status until `reported`.
4. Download the JSON report and any required artefacts (PCAP,
   screenshots, dropped files, CAPE config, payloads, process memory, …).

The Host↔Guest agent protocol on `http://<vm_ip>:8000` is **internal**:
it is consumed by the CAPE host process (`lib/cuckoo/core/guest.py`) when
driving the guest VM, and clients should not call it directly.

## Prerequisites (one-time, not over HTTP)

These cannot be done via the public API and must be in place beforehand:

- The CAPE host stack is deployed and the four systemd services are
  running: `cape.service`, `cape-processor.service`, `cape-rooter.service`,
  `cape-web.service`.
- At least one analysis VM exists, has a snapshot, and runs `agent.py`
  inside the guest.
- The endpoints you intend to call are **enabled** in `conf/api.conf`
  (see [Per-endpoint gating](#per-endpoint-gating) below — many endpoints
  ship `enabled = no` by default).
- For Token authentication, the user has been created and a DRF auth token
  has been issued (`manage.py drf_create_token <user>` or auto-generated
  via `POST /apiv2/api-token-auth/`).

## Authentication

Two authentication backends are configured in `web/web/settings.py`:

- `rest_framework.authentication.TokenAuthentication` — recommended for
  programmatic clients.
- `rest_framework.authentication.SessionAuthentication` — used by the
  browser.

### Token enrolment

```bash
curl -d "username=<USER>&password=<PASSWD>" \
     "https://<HOST>/apiv2/api-token-auth/"
# → {"token": "0123abcd..."}
```

All subsequent requests carry:

```
Authorization: Token 0123abcd...
```

Token authentication is gated by `[api] token_auth_enabled` in `api.conf`
(default: `no` for local-only deployments where session auth suffices;
set to `yes` for any non-trivial integration). Throttling limits per
endpoint are also defined in `api.conf`.

## Per-endpoint gating

Every view in `web/apiv2/views.py` checks an `api.conf` flag before
serving the request. If the flag is `enabled = no`, the endpoint returns:

```json
{"error": true, "error_value": "<feature> API is Disabled"}
```

The defaults shipped in `conf/default/api.conf.default` are conservative.
Endpoints disabled by default include — among others — `taskdelete`,
`taskreprocess`, `taskresched`, `machinelist`, `machineview`,
`cuckoostatus`, `sampledl`, `taskfullmemory`, `taskselfextracted`,
`downloading_services`, `dlnexeccreate`, `mitmdump`, `rollingsuri`,
`list_exitnodes`, `statistics`, `tasks_latest`, `task_x_hours`,
`user_stop`. Enable each one explicitly when you need it.

## Endpoint reference

All paths are relative to `/apiv2/`. The "gate" column is the `api.conf`
section whose `enabled` flag the view checks; "default" shows that flag's
value in `conf/default/api.conf.default`.

### Authentication

| Method | Path                  | View                            | Gate (default)               | Notes                                                       |
| ------ | --------------------- | ------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| POST   | `/api-token-auth/`    | `rest_framework.authtoken`      | `[api] token_auth_enabled` (no) | Body: `username`, `password`. Returns `{"token": "..."}`. |

### Submission

Eighteen submission options are shared across the create endpoints and
parsed centrally by `parse_request_arguments()` in
`lib/cuckoo/common/web_utils.py`: `package`, `timeout`, `priority`,
`options`, `machine`, `platform`, `tags`, `custom`, `memory`, `clock`,
`enforce_timeout`, `unique`, `referrer`, `tlp`, `tags_tasks`, `route`,
`cape`, `static`.

| Method | Path                                  | View                       | Gate (default)               | Body                                                                                                                |
| ------ | ------------------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| POST   | `/tasks/create/file/`                 | `tasks_create_file`        | `[filecreate]` (yes)         | multipart `file=@...` plus shared options. `pcap=1` for PCAP-only, `static=1` for static-only.                       |
| POST   | `/tasks/create/url/`                  | `tasks_create_url`         | `[urlcreate]` (yes)          | `url=...` plus shared options.                                                                                       |
| POST   | `/tasks/create/dlnexec/`              | `tasks_create_dlnexec`     | `[dlnexeccreate]` (no)       | `dlnexec=<url>`: host fetches the URL and detonates it.                                                              |
| POST   | `/tasks/create/static/`               | `tasks_create_static`      | `[staticextraction]` (yes)   | `file=@...`: static analysis only, no VM is allocated.                                                               |
| POST   | `/tasks/create/download_services/`    | `tasks_download_services`  | `[downloading_services]` (no) | `hashes=...` (md5/sha1/sha256). Optional `options=apikey=<vt>` to pull from VirusTotal / MalwareBazaar.              |

All return the canonical envelope:

```json
{"error": false, "data": {"task_ids": [123], "message": "..."}}
```

### Status, machines, system

| Method | Path                              | View              | Gate (default)            | Notes                                                                                                                                                |
| ------ | --------------------------------- | ----------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/tasks/status/<task_id>/`        | `tasks_status`    | `[taskstatus]` (yes)      | Returns `{"data": "<state>"}` where state is `pending`, `running`, `completed`, `reported`, `failed_analysis`, `failed_processing`, or `failed_reporting`. |
| POST   | `/tasks/status/<task_id>/`        | `tasks_status`    | `[user_stop]` (no)        | Body `status=finish` asks the host to signal the running guest to finish early.                                                                       |
| GET    | `/tasks/view/<task_id>/`          | `tasks_view`      | `[taskview]` (yes)        | Full task metadata.                                                                                                                                  |
| GET    | `/cuckoo/status/`                 | `cuckoo_status`   | `[cuckoostatus]` (no)     | Sandbox-wide status (version, queue, disk).                                                                                                          |
| GET    | `/machines/list/`                 | `machines_list`   | `[machinelist]` (no)      | All registered machines.                                                                                                                             |
| GET    | `/machines/view/<name>/`          | `machines_view`   | `[machineview]` (no)      | Single machine details.                                                                                                                              |
| GET    | `/exitnodes/`                     | `exit_nodes_list` | `[list_exitnodes]` (no)   | VPN / SOCKS5 exit nodes available to the `route` option.                                                                                             |

### List & search

| Method | Path                                                | View                  | Gate (default)             | Notes                                            |
| ------ | --------------------------------------------------- | --------------------- | -------------------------- | ------------------------------------------------ |
| GET    | `/tasks/list/[<limit>/[<offset>/[<window>/]]]`      | `tasks_list`          | `[tasklist]` (yes)         | `window` is hours.                               |
| GET    | `/tasks/get/latests/<hours>/`                       | `tasks_latest`        | `[tasks_latest]` (no)      | Tasks added in the last N hours.                 |
| GET    | `/tasks/stats/`                                     | `task_x_hours`        | `[task_x_hours]` (no)      | Per-hour task counts.                            |
| GET    | `/tasks/statistics/<days>/`                         | `statistics_data`     | `[statistics]` (no)        | Per-day task counts.                             |
| GET    | `/tasks/search/{md5,sha1,sha256}/<value>/`          | `tasks_search`        | `[tasksearch]` (yes)       | Find tasks by sample hash.                       |
| POST   | `/tasks/extendedsearch/`                            | `ext_tasks_search`    | `[extendedtasksearch]` (yes) | Body `option=<field>&argument=<value>`.        |
| GET    | `/files/view/{md5,sha1,sha256,id}/<value>/`         | `files_view`          | `[fileview]` (yes)         | Sample metadata.                                 |

### Reports & artefacts

| Method | Path                                                       | View                    | Gate (default)             | Notes                                                                                  |
| ------ | ---------------------------------------------------------- | ----------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/tasks/get/report/<task_id>/[<format>/[<make_zip>/]]`     | `tasks_report`          | `[taskreport]` (yes)       | `format ∈ {json, html, all, dropped, dist, lite, ...}`; default `json`.                 |
| GET    | `/tasks/get/iocs/<task_id>/[detailed/]`                    | `tasks_iocs`            | `[taskiocs]` (yes)         | Summary or detailed IOC view.                                                          |
| GET    | `/tasks/get/config/<task_id>/[<cape_name>/]`               | `tasks_config`          | `[capeconfig]` (yes)       | Extracted malware configuration; optional family filter.                                |
| GET    | `/tasks/get/screenshot/<task_id>/[<n>/]`                   | `tasks_screenshot`      | `[taskscreenshot]` (yes)   | All screenshots as ZIP, or a single PNG by index.                                       |
| GET    | `/tasks/get/pcap/<task_id>/`                               | `tasks_pcap`            | `[taskpcap]` (yes)         | `dump.pcap` from the auxiliary sniffer.                                                 |
| GET    | `/tasks/get/tlspcap/<task_id>/`                            | `tasks_tlspcap`         | `[tasktlspcap]` (yes)      | TLS-decrypted PCAP.                                                                    |
| GET    | `/tasks/get/evtx/<task_id>/`                               | `tasks_evtx`            | `[taskevtx]` (yes)         | Windows EVTX log bundle.                                                                |
| GET    | `/tasks/get/mitmdump/<task_id>/`                           | `tasks_mitmdump`        | `[mitmdump]` (no)          | mitmproxy capture (gate name differs from path).                                        |
| GET    | `/tasks/get/dropped/<task_id>/`                            | `tasks_dropped`         | `[taskdropped]` (yes)      | ZIP of files dropped by the sample inside the guest.                                    |
| GET    | `/tasks/get/selfextracted/<task_id>/[<tool>/]`             | `tasks_selfextracted`   | `[taskselfextracted]` (no) | Self-extracted artefacts; optional tool filter.                                         |
| GET    | `/tasks/get/surifile/<task_id>/`                           | `tasks_surifile`        | `[taskdropped]` (yes)      | Files extracted by Suricata (shares the dropped gate).                                  |
| GET    | `/tasks/get/payloadfiles/<task_id>/`                       | `tasks_payloadfiles`    | `[payloadfiles]` (yes)     | Payloads unpacked by CAPE.                                                              |
| GET    | `/tasks/get/procdumpfiles/<task_id>/`                      | `tasks_procdumpfiles`   | `[procdumpfiles]` (no)     | Per-process memory dumps.                                                               |
| GET    | `/tasks/get/procmemory/<task_id>/[<pid>/]`                 | `tasks_procmemory`      | `[taskprocmemory]` (yes)   | All process memory or a single PID.                                                     |
| GET    | `/tasks/get/fullmemory/<task_id>/`                         | `tasks_fullmemory`      | `[taskfullmemory]` (no)    | Full guest memory dump (large).                                                         |
| POST   | `/tasks/get/stream/<task_id>/`                             | `tasks_file_stream`     | `[taskstatus]` (yes)       | Stream a file out of a still-running guest.                                             |
| GET    | `/files/get/{md5,sha1,sha256,task}/<value>/`               | `file`                  | `[sampledl]` (no)          | Download the original sample.                                                           |

### Task management

| Method | Path                                          | View                  | Gate (default)         | Notes                                                                  |
| ------ | --------------------------------------------- | --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| GET    | `/tasks/reschedule/<task_id>/`                | `tasks_reschedule`    | `[taskresched]` (no)   | Re-queue a task.                                                       |
| GET    | `/tasks/reprocess/<task_id>/`                 | `tasks_reprocess`     | `[taskreprocess]` (no) | Re-run processing/signatures/reporting on the existing analysis.       |
| GET    | `/tasks/delete/<task_id>/[<status>/]`         | `tasks_delete`        | `[taskdelete]` (no)    | `task_id` accepts `1,2,3` or `1-5`. Optional state filter.             |
| POST   | `/tasks/delete_many/`                         | `tasks_delete_many`   | `[taskdelete]` (no)    | Body `task_ids=1,2,3`.                                                  |

### Suricata rolling

| Method | Path                                  | View                  | Gate (default)        | Notes                                              |
| ------ | ------------------------------------- | --------------------- | --------------------- | -------------------------------------------------- |
| GET    | `/tasks/rollingsuri/[<window>/]`      | `tasks_rollingsuri`   | `[rollingsuri]` (no)  | Rolling Suricata alerts across recent tasks.       |

### Distributed

These views exist for the distributed controller (`utils/dist.py`, which
runs as a separate Flask process). They are **not** wired into
`web/apiv2/urls.py` in a standard single-host deployment.

- `GET /apiv2/dist/tasks_reported` → `dist_tasks_reported`
- `GET /apiv2/dist/tasks_notification/<task_id>` → `dist_tasks_notification`

### Discovery page

- `GET /apiv2/` (`index`) — renders `web/templates/apiv2/index.html`, a
  human-readable table of all endpoints with their current `enabled` /
  RPS / RPM values pulled live from `api.conf`. Useful for verifying
  which endpoints are actually open on a given deployment.

## Minimal end-to-end client

See [`run_analysis.sh`](./run_analysis.sh) in this directory for a
self-contained bash script that performs the full workflow. The script
assumes `[filecreate]`, `[taskstatus]`, `[taskreport]`, `[taskiocs]`,
`[capeconfig]`, `[taskpcap]`, `[payloadfiles]` and `[taskscreenshot]`
are enabled (the defaults), and that token authentication is in use.

Usage:

```bash
HOST=https://cape.example.com USER=alice PASS=secret \
    ./run_analysis.sh ./sample.exe
```

URL submission, `dlnexec`, and `download_services` follow the same
**submit → poll → fetch** pattern; only the create endpoint changes.

## Operational notes

- **Polling cadence**: `[taskstatus]` is the highest-volume endpoint and
  has the most permissive throttling default (`rps = 4/s`). Five-second
  polling is comfortable; sub-second polling will hit the rate limit.
- **Failure states**: a task that ends in `failed_analysis`,
  `failed_processing`, or `failed_reporting` will not transition to
  `reported`. Treat any `failed_*` state as terminal and surface
  `GET /tasks/view/<task_id>/` for diagnostics.
- **Large artefacts**: `fullmemory`, `procmemory` (all PIDs),
  `payloadfiles` and `procdumpfiles` can be hundreds of MBs. Stream them
  to disk (`curl -o`) and validate the response is not the JSON error
  envelope before treating it as binary.
- **What HTTP cannot do**: enabling endpoints, issuing tokens for new
  users, configuring VMs, configuring routing, and editing
  `processing.conf` / `reporting.conf` are all out-of-band operations.
  Plan for them in your deployment runbook.

## See also

- `docs/book/src/usage/api.rst` — REST API installation, token
  generation, and throttling.
- `docs/book/src/usage/submit.rst` — non-API submission paths (web UI,
  `submit.py`).
- `docs/book/src/usage/internals.rst` — host/guest analysis lifecycle.
- `docs/book/src/usage/results.rst` — structure of the JSON report
  returned by `/tasks/get/report/`.
