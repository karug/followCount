#!/bin/bash
# Out-of-browser watchdog for the followCount kiosk.
#
# The page sends a heartbeat to the backend on every slide change. If the
# renderer freezes, the heartbeats stop and /api/kiosk reports stale=true;
# this script then restarts the kiosk service and logs what the Pi looked
# like at that moment. Meant to run as root from a systemd timer.
#
# It never fails loudly: any error (backend down, bad JSON) just exits 0,
# because killing a healthy kiosk is worse than missing one check.

set -u

URL="${KIOSK_STATUS_URL:-http://localhost:3000/api/kiosk}"
UNIT="${KIOSK_UNIT:-followcount-kiosk}"
TAG="followcount-kiosk-watchdog"

log() {
    echo "$TAG: $*"
}

# Backend down: its own Restart=always handles that.
response=$(curl -s --max-time 5 "$URL") || exit 0
[ -n "$response" ] || exit 0

# Prints: stale threshold age last_payload (one line; last_payload is JSON).
parsed=$(printf '%s' "$response" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("1" if d.get("stale") is True else "0",
      int(d.get("thresholdSeconds", 0)),
      d.get("ageSeconds"),
      json.dumps(d.get("last"), separators=(",", ":")))
' 2>/dev/null) || exit 0
[ -n "$parsed" ] || exit 0

read -r stale threshold age last <<< "$parsed"

[ "$stale" = "1" ] || exit 0
case "$threshold" in ''|*[!0-9]*) exit 0 ;; esac

# Only act on a kiosk that has been up longer than the threshold; a freshly
# (re)started browser has not had time to send its first heartbeat, and this
# also prevents restart loops.
state=$(systemctl show -p ActiveState --value "$UNIT" 2>/dev/null) || exit 0
[ "$state" = "active" ] || exit 0

entered_us=$(systemctl show -p ActiveEnterTimestampMonotonic --value "$UNIT" 2>/dev/null) || exit 0
case "$entered_us" in ''|*[!0-9]*) exit 0 ;; esac
[ "$entered_us" -gt 0 ] || exit 0

uptime_s=$(cut -d. -f1 /proc/uptime 2>/dev/null) || exit 0
case "$uptime_s" in ''|*[!0-9]*) exit 0 ;; esac

active_s=$(( uptime_s - entered_us / 1000000 ))
[ "$active_s" -gt "$threshold" ] || exit 0

throttled="n/a"
arm_clock="n/a"
if command -v vcgencmd >/dev/null 2>&1; then
    throttled=$(vcgencmd get_throttled 2>&1 | tr -d '\n')
    arm_clock=$(vcgencmd measure_clock arm 2>&1 | tr -d '\n')
fi

memory=$(free -m 2>/dev/null | awk '/^Mem:/ {printf "total=%sMB used=%sMB free=%sMB available=%sMB", $2, $3, $4, $7}')

log "kiosk frozen: heartbeat age=${age}s threshold=${threshold}s kiosk active for ${active_s}s"
log "last heartbeat payload: $last"
log "throttled: $throttled (0x0 = healthy; bit0/16 under-voltage, bit1/17 freq capped, bit2/18 throttled)"
log "arm clock: $arm_clock"
log "memory: ${memory:-n/a}"
log "restarting $UNIT"

systemctl restart "$UNIT" || log "restart of $UNIT failed"

exit 0
