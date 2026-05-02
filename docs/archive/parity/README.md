# Submit-page parity stack

Stand up a clean CAPEv2 + SPA in Docker, then verify with Playwright that
**every form field upstream `/submit/` exposes is also present in the SPA's
`/submit` page**.

## Why

Upstream's `web/submission/index.html` (Bootstrap form) and our React SPA
have the same backing logic but different markup. This stack lets us prove
field-for-field parity without depending on a remote test box.

## Components

```
docker compose -f docker/parity/docker-compose.yml ps

NAME                   IMAGE                       PORTS
cape-parity-db         postgres:16-alpine          5432
cape-parity-mongo      mongo:7                     27017
cape-parity-django     parity/cape-django:latest   8000
cape-parity-spa        parity/cape-spa:latest      5173
```

The `cape-parity-django` container runs the Django web layer of THIS fork.
Because we made only **additive** changes (new `web/apiv3` app + new
`frontend/app` SPA), the legacy `web/submission/` Django app is byte-equal
to upstream master and serves the original Bootstrap form at
`http://localhost:8000/submit/`. Our SPA at `http://localhost:5173/submit`
talks to the same Django over `/api/v3/*`.

## Run

```bash
# 1. Bring everything up (postgres → mongo → cape → spa)
docker compose -f docker/parity/docker-compose.yml up -d --build

# 2. Wait for migrations + admin user (look for "[parity] runserver")
docker compose -f docker/parity/docker-compose.yml logs -f cape

# 3. Sanity-check both URLs in your browser
open http://localhost:8000/submit/   # upstream Bootstrap form
open http://localhost:5173/submit    # SPA form
```

Login on either side: `admin` / `admin`.

## Run the parity test

```bash
cd frontend/app
npx playwright install --with-deps  # one-time
npx playwright test tests/e2e/submit-parity.spec.mjs --reporter=line
```

The spec:

1. Logs into both `http://localhost:8000` (upstream) and
   `http://localhost:5173` (SPA).
2. Visits `/submit/` and `/submit` respectively, scrapes every
   `input[name]`, `select[name]`, `textarea[name]`.
3. For the SPA it cycles every mode tab (File / Download / URL / DL & Exec
   / PCAP / Static / Resubmit) so conditional inputs render at least once.
4. Diffs the field inventories against the canonical list defined inside
   `submit-parity.spec.mjs` (`SUBMIT_FIELDS` constant).
5. Writes a JSON report to `test-results/submit-parity.json`.
6. **Fails the run if the SPA is missing any required upstream field.**

## Override URLs / creds

```bash
PARITY_UPSTREAM_URL=http://upstream.example PARITY_SPA_URL=http://spa.example \
PARITY_USER=alice PARITY_PASS=secret \
  npx playwright test tests/e2e/submit-parity.spec.mjs
```

## Tear down

```bash
docker compose -f docker/parity/docker-compose.yml down -v
```

## Field inventory (canonical)

The `SUBMIT_FIELDS` constant in `submit-parity.spec.mjs` enumerates every
field both sides must expose:

| Group | Fields |
|---|---|
| Modes | `sample`, `pcap`, `static` (file inputs) · `url`, `dlnexec`, `hashes`, `hash` (text inputs) |
| 18 shared params | `package`, `timeout`, `priority`, `options`, `lin_options`, `machine`, `tags`, `tags_tasks`, `custom`, `clock`, `route`, `tlp`, `pre_script`, `during_script`, `referrer`, `memory`, `enforce_timeout`, `unique` |
| Resubmit | `hash`, `job_category` |
| 17 ext capabilities | `process_dump`, `process_memory`, `amsidump`, `import_reconstruction`, `memory`, `enforce_timeout`, `free`, `unpacker`, `syscall`, `norefer`, `nohuman`, `interactive`, `manual`, `kernel_analysis`, `static_config`, `oldloader`, `screenshots_qr` |
| SPA-only (extra) | `mitmdump` |

Conditional fields (`required: false`) are gated by `web.conf` /
`api.conf` — a missing-on-one-side result is reported as
`ignored_environment_gated` rather than a failure.

## Adding a field

1. Add the field to upstream → mirror it in the SPA's
   `frontend/app/src/components/submit/`.
2. Add the field name to `SUBMIT_FIELDS` in
   `submit-parity.spec.mjs`. Set `required: true` if every CAPE deploy
   should expose it; `required: false` if it's environment-gated.
3. Re-run the parity test.
