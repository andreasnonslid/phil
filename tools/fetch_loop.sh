#!/usr/bin/env bash
# Repeatedly runs fetch_hist_figures.py and fetch_hist_events.py until both
# produce valid non-empty JSON arrays. Sleeps RETRY_SLEEP seconds between attempts.
# Usage: bash tools/fetch_loop.sh [output_dir]
# Override retry interval: RETRY_SLEEP=120 bash tools/fetch_loop.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
OUT_DIR="${1:-$REPO}"
FIGURES_OUT="$OUT_DIR/figures_raw.json"
EVENTS_OUT="$OUT_DIR/events_raw.json"
RETRY_SLEEP="${RETRY_SLEEP:-300}"  # 5 min default

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }

valid_json_array() {
    local f="$1"
    [[ -f "$f" ]] && python -c "
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, list) and len(data) > 0
" "$f" 2>/dev/null
}

run_fetch() {
    local label="$1" script="$2" out="$3"

    if valid_json_array "$out"; then
        log "$label: already have valid data ($(python -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$out") entries) — skipping"
        return 0
    fi

    log "$label: starting $script ..."
    local tmp="${out}.tmp"
    # stdout → tmp file; stderr (progress) → our stderr (terminal)
    if python "$script" > "$tmp"; then
        if valid_json_array "$tmp"; then
            mv "$tmp" "$out"
            local count
            count=$(python -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$out")
            log "$label: done — $count entries written to $(basename "$out")"
            return 0
        else
            log "$label: script exited 0 but output is not a valid non-empty JSON array"
        fi
    else
        log "$label: script exited non-zero (Wikidata still down?)"
    fi
    rm -f "$tmp"
    return 1
}

attempt=0
while true; do
    attempt=$((attempt + 1))
    log "=== Attempt $attempt ==="

    figures_done=false; events_done=false
    run_fetch "figures" "$SCRIPT_DIR/fetch_hist_figures.py" "$FIGURES_OUT" && figures_done=true || true
    run_fetch "events"  "$SCRIPT_DIR/fetch_hist_events.py"  "$EVENTS_OUT"  && events_done=true  || true

    if $figures_done && $events_done; then
        log "Both datasets complete."
        exit 0
    fi

    log "Sleeping ${RETRY_SLEEP}s before next attempt..."
    sleep "$RETRY_SLEEP"
done
