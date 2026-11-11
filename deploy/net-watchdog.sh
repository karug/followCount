#!/bin/bash
# Vigilante de red del kiosco followCount.
#
# La Pi sale solo por wlan0 y, con bajo voltaje, la wifi se cae y no vuelve.
# Nada lo notaba: el navegador seguia pintando y el backend respondia en
# localhost. Este script (un oneshot lanzado por un timer de systemd, como
# root) comprueba la red y escala: log -> recuperar la wifi -> reiniciar.
#
# Nunca falla ruidosamente: cualquier error (orden ausente, salida rara) acaba
# en exit 0, porque reiniciar una Pi sana es peor que perder un chequeo.
#
# Con NET_WATCHDOG_DRY_RUN=1 solo registra lo que haria.

set -u

IFACE="${NET_WATCHDOG_IFACE:-wlan0}"
STATE="${NET_WATCHDOG_STATE:-/var/lib/followcount/net-watchdog.state}"
UPTIME_FILE="${NET_WATCHDOG_UPTIME_FILE:-/proc/uptime}"
PING_TARGETS="${NET_WATCHDOG_PING_TARGETS:-1.1.1.1 8.8.8.8}"
DNS_HOST="${NET_WATCHDOG_DNS_HOST:-graph.facebook.com}"
RECOVER_AFTER="${NET_WATCHDOG_RECOVER_AFTER:-3}"
REBOOT_AFTER="${NET_WATCHDOG_REBOOT_AFTER:-10}"
REBOOT_INTERVAL="${NET_WATCHDOG_REBOOT_INTERVAL:-21600}"
BOOT_GRACE="${NET_WATCHDOG_BOOT_GRACE:-180}"
REBOOT_MIN_UPTIME="${NET_WATCHDOG_REBOOT_MIN_UPTIME:-900}"
DRY_RUN="${NET_WATCHDOG_DRY_RUN:-0}"
TAG="followcount-net-watchdog"

log() {
    echo "$TAG: $*"
}

is_num() {
    case "${1:-}" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac
}

now=${NET_WATCHDOG_NOW:-$(date +%s 2>/dev/null)}
is_num "$now" || exit 0

uptime_s=$(cut -d. -f1 "$UPTIME_FILE" 2>/dev/null) || exit 0
is_num "$uptime_s" || exit 0

# No actuar en los primeros minutos de arranque: la wifi aun se esta levantando.
[ "$uptime_s" -ge "$BOOT_GRACE" ] || exit 0

# --- Estado persistente (fails, since, last_reboot) -------------------------

state_get() {
    local v
    v=$(sed -n "s/^$1=//p" "$STATE" 2>/dev/null | head -n 1)
    is_num "$v" && echo "$v" || echo 0
}

fails=$(state_get fails)
since=$(state_get since)
last_reboot=$(state_get last_reboot)

save_state() {
    mkdir -p "$(dirname "$STATE")" 2>/dev/null || return 0
    local tmp="$STATE.tmp.$$"
    printf 'fails=%s\nsince=%s\nlast_reboot=%s\n' "$fails" "$since" "$last_reboot" > "$tmp" 2>/dev/null \
        && mv -f "$tmp" "$STATE" 2>/dev/null
    rm -f "$tmp" 2>/dev/null
    return 0
}

# --- Chequeo de salud -------------------------------------------------------

have_ip=0
have_route=0
gateway=""
gateway_ok=0
internet_ok=0
dns_ok=0

if ip -4 addr show dev "$IFACE" 2>/dev/null | grep -q 'inet '; then
    have_ip=1
fi

route_line=$(ip route show default 2>/dev/null | grep "dev $IFACE" | head -n 1)
if [ -n "$route_line" ]; then
    have_route=1
    gateway=$(echo "$route_line" | awk '{for (i = 1; i < NF; i++) if ($i == "via") {print $(i + 1); exit}}')
fi

if [ "$have_ip" = 1 ] && [ "$have_route" = 1 ]; then
    if [ -n "$gateway" ] && ping -c 1 -W 2 "$gateway" >/dev/null 2>&1; then
        gateway_ok=1
    fi
    for target in $PING_TARGETS; do
        if ping -c 1 -W 2 "$target" >/dev/null 2>&1; then
            internet_ok=1
            break
        fi
    done
    if getent hosts "$DNS_HOST" >/dev/null 2>&1; then
        dns_ok=1
    fi
fi

# --- Red sana: contador a cero ----------------------------------------------

if [ "$internet_ok" = 1 ] && [ "$dns_ok" = 1 ]; then
    if [ "$fails" -gt 0 ]; then
        outage=0
        [ "$since" -gt 0 ] && outage=$(( now - since ))
        log "red recuperada tras ${outage} s sin red ($fails chequeos fallidos seguidos)"
    fi
    fails=0
    since=0
    save_state
    exit 0
fi

# --- Fallo: clasificar la causa ----------------------------------------------

if [ "$have_ip" = 0 ] || [ "$have_route" = 0 ]; then
    cause="wifi"
    detail="sin IP o sin ruta por defecto en $IFACE (wifi caida: ip=$have_ip ruta=$have_route)"
elif [ "$internet_ok" = 0 ] && [ "$gateway_ok" = 1 ]; then
    cause="router"
    detail="LAN bien (la puerta de enlace $gateway responde) pero sin internet: problema del router o del operador, la Pi no puede arreglarlo"
elif [ "$internet_ok" = 0 ]; then
    cause="gateway"
    detail="la puerta de enlace ${gateway:-?} no responde ni hay internet: enlace wifi degradado"
else
    cause="dns"
    detail="hay internet (ping) pero el DNS no resuelve $DNS_HOST"
fi

[ "$fails" -gt 0 ] || since=$now
fails=$(( fails + 1 ))
[ "$since" -gt 0 ] || since=$now
outage=$(( now - since ))
save_state

log "fallo de red $fails (causa: $cause): $detail; sin red desde hace ${outage} s"

# --- Utilidades de accion ------------------------------------------------------

snapshot() {
    local out
    log "--- foto del momento ---"
    if command -v vcgencmd >/dev/null 2>&1; then
        log "vcgencmd get_throttled: $(vcgencmd get_throttled 2>&1 | tr -d '\n') (0x0 = sano; bit0/16 bajo voltaje, bit1/17 frecuencia limitada, bit2/18 estrangulada)"
    else
        log "vcgencmd get_throttled: n/a"
    fi
    if command -v iw >/dev/null 2>&1; then
        out=$(iw dev "$IFACE" link 2>&1 | tr '\n' ' ')
    elif command -v iwconfig >/dev/null 2>&1; then
        out=$(iwconfig "$IFACE" 2>&1 | tr '\n' ' ')
    else
        out="n/a"
    fi
    log "wifi $IFACE: ${out:-n/a}"
    log "ip -4 addr: $(ip -4 addr show dev "$IFACE" 2>&1 | tr '\n' ' ')"
    log "ip route: $(ip route 2>&1 | tr '\n' ' ')"
    log "contador de fallos: $fails; sin red desde hace ${outage} s"
    log "--- fin de la foto ---"
}

# Ejecuta una accion, o solo la registra en modo simulacion.
act() {
    if [ "$DRY_RUN" = 1 ]; then
        log "[simulacion] haria: $*"
        return 0
    fi
    log "ejecutando: $*"
    "$@"
}

unit_active() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

recover_wifi() {
    if unit_active NetworkManager; then
        log "gestor de red detectado: NetworkManager"
        act nmcli device reapply "$IFACE" && return 0
        log "nmcli device reapply fallo; reinicio NetworkManager"
        act systemctl restart NetworkManager && return 0
    elif unit_active dhcpcd; then
        log "gestor de red detectado: dhcpcd"
        act systemctl restart dhcpcd && return 0
    else
        log "ningun gestor activo (ni NetworkManager ni dhcpcd): uso wpa_cli"
        act wpa_cli -i "$IFACE" reconfigure && return 0
        log "wpa_cli fallo"
    fi
    log "ultimo recurso: bajar y subir $IFACE"
    act ip link set "$IFACE" down
    act ip link set "$IFACE" up
}

# --- Escalado -------------------------------------------------------------------

if [ "$cause" = "router" ]; then
    log "no hago nada: ni recuperar la wifi ni reiniciar arreglarian un fallo fuera de la Pi"
    exit 0
fi

if [ "$fails" -eq "$RECOVER_AFTER" ]; then
    snapshot
    log "$fails fallos seguidos: intento recuperar la wifi"
    recover_wifi || log "la recuperacion de la wifi fallo"
fi

if [ "$fails" -ge "$REBOOT_AFTER" ]; then
    since_reboot=$(( now - last_reboot ))
    if [ "$uptime_s" -le "$REBOOT_MIN_UPTIME" ]; then
        log "no reinicio: uptime ${uptime_s} s (minimo ${REBOOT_MIN_UPTIME} s)"
    elif [ "$last_reboot" -gt 0 ] && [ "$since_reboot" -lt "$REBOOT_INTERVAL" ]; then
        log "no reinicio: el ultimo reinicio por red fue hace ${since_reboot} s (maximo uno cada $(( REBOOT_INTERVAL / 3600 )) h)"
    else
        snapshot
        log "$fails fallos seguidos (~$(( outage / 60 )) min sin red): reinicio la Pi"
        if [ "$DRY_RUN" != 1 ]; then
            last_reboot=$now
            save_state
        fi
        act systemctl reboot || log "systemctl reboot fallo"
    fi
fi

exit 0
