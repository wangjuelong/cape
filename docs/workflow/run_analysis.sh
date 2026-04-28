#!/usr/bin/env bash
#
# HTTP-only end-to-end CAPE sample analysis.
#
# Performs the full workflow against a CAPE deployment using only the
# /apiv2/ REST API: token enrolment, file submission, status polling,
# and artefact retrieval. See ./README.md for the complete endpoint
# reference and operational notes.
#
# Required api.conf gates (enabled = yes):
#   [filecreate], [taskstatus], [taskreport], [taskiocs], [capeconfig],
#   [taskpcap], [payloadfiles], [taskscreenshot]
#
# Usage:
#   HOST=https://cape.example.com USER=alice PASS=secret \
#       ./run_analysis.sh ./sample.exe
#
# Optional environment variables:
#   PACKAGE         analysis package (default: exe)
#   TIMEOUT         analysis timeout in seconds (default: 120)
#   PRIORITY        task priority (default: 2)
#   ROUTE           network route: none|internet|inetsim|tor|vpn (default: internet)
#   OPTIONS         comma-separated CAPE options (default: procdump=1,human=1)
#   POLL_INTERVAL   status poll interval in seconds (default: 5)
#   OUT_DIR         output directory (default: task_<task_id>)

set -euo pipefail

# ------------------------------ inputs ------------------------------

SAMPLE=${1:-}
if [[ -z "$SAMPLE" ]]; then
    echo "usage: $0 <sample-path>" >&2
    exit 64
fi
if [[ ! -f "$SAMPLE" ]]; then
    echo "sample not found: $SAMPLE" >&2
    exit 66
fi

: "${HOST:?set HOST=https://your-cape.local}"
: "${USER:?set USER=<api user>}"
: "${PASS:?set PASS=<api password>}"

PACKAGE=${PACKAGE:-exe}
TIMEOUT=${TIMEOUT:-120}
PRIORITY=${PRIORITY:-2}
ROUTE=${ROUTE:-internet}
OPTIONS=${OPTIONS:-procdump=1,human=1}
POLL_INTERVAL=${POLL_INTERVAL:-5}

for tool in curl jq; do
    command -v "$tool" >/dev/null || { echo "missing dependency: $tool" >&2; exit 69; }
done

# --------------------------- 1) auth token --------------------------

echo "[1/4] obtaining token from $HOST"
TOKEN=$(curl -fsS -X POST "$HOST/apiv2/api-token-auth/" \
    -d "username=$USER&password=$PASS" | jq -r .token)
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    echo "failed to obtain token" >&2
    exit 1
fi
AUTH=(-H "Authorization: Token $TOKEN")

# --------------------------- 2) submission --------------------------

echo "[2/4] submitting $SAMPLE"
SUBMIT_RESPONSE=$(curl -fsS "${AUTH[@]}" \
    -F "file=@${SAMPLE}" \
    -F "package=${PACKAGE}" \
    -F "timeout=${TIMEOUT}" \
    -F "priority=${PRIORITY}" \
    -F "options=${OPTIONS}" \
    -F "route=${ROUTE}" \
    "$HOST/apiv2/tasks/create/file/")

if [[ "$(jq -r .error <<<"$SUBMIT_RESPONSE")" == "true" ]]; then
    echo "submission failed: $(jq -r .error_value <<<"$SUBMIT_RESPONSE")" >&2
    exit 1
fi

TASK_ID=$(jq -r '.data.task_ids[0]' <<<"$SUBMIT_RESPONSE")
if [[ -z "$TASK_ID" || "$TASK_ID" == "null" ]]; then
    echo "no task_id in response: $SUBMIT_RESPONSE" >&2
    exit 1
fi
echo "      task_id=$TASK_ID"

OUT_DIR=${OUT_DIR:-task_${TASK_ID}}
mkdir -p "$OUT_DIR"

# --------------------------- 3) poll status -------------------------

echo "[3/4] polling status (interval=${POLL_INTERVAL}s)"
while :; do
    STATUS=$(curl -fsS "${AUTH[@]}" \
        "$HOST/apiv2/tasks/status/$TASK_ID/" | jq -r .data)
    printf "      status=%s\n" "$STATUS"
    case "$STATUS" in
        reported)
            break
            ;;
        failed_*)
            echo "analysis ended in $STATUS — fetching task view for diagnostics"
            curl -fsS "${AUTH[@]}" "$HOST/apiv2/tasks/view/$TASK_ID/" \
                -o "$OUT_DIR/task_view.json" || true
            exit 1
            ;;
    esac
    sleep "$POLL_INTERVAL"
done

# --------------------------- 4) fetch artefacts ---------------------

echo "[4/4] fetching artefacts into $OUT_DIR"

fetch() {
    local path="$1" out="$2"
    if curl -fsS "${AUTH[@]}" "$HOST$path" -o "$out"; then
        # Reject the JSON-error envelope being saved as a binary file.
        if head -c 1 "$out" | grep -q '{' \
            && jq -e '.error == true' "$out" >/dev/null 2>&1; then
            echo "      $path → $(jq -r .error_value "$out")"
            rm -f "$out"
            return
        fi
        echo "      $path → $out"
    else
        echo "      $path → request failed (skipped)"
    fi
}

fetch "/apiv2/tasks/get/report/$TASK_ID/json/"           "$OUT_DIR/report.json"
fetch "/apiv2/tasks/get/iocs/$TASK_ID/detailed/"         "$OUT_DIR/iocs.json"
fetch "/apiv2/tasks/get/config/$TASK_ID/"                "$OUT_DIR/config.json"
fetch "/apiv2/tasks/get/pcap/$TASK_ID/"                  "$OUT_DIR/dump.pcap"
fetch "/apiv2/tasks/get/payloadfiles/$TASK_ID/"          "$OUT_DIR/payloads.zip"
fetch "/apiv2/tasks/get/screenshot/$TASK_ID/"            "$OUT_DIR/screenshots.zip"

echo "done. artefacts in $OUT_DIR"
