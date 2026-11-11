const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "..", "deploy", "net-watchdog.sh");

const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;
const skipReason = hasBash ? false : "bash no disponible en esta maquina";

// Orden falsa generica: registra la llamada y responde segun variables FAKE_*.
const FAKE = `#!/bin/bash
name=$(basename "$0")
echo "$name $*" >> "$FAKE_CALLS"
rcvar="FAKE_RC_$(echo "$name" | tr a-z- A-Z_)"
rc="\${!rcvar:-0}"
case "$name" in
  ping)
    for h in $FAKE_PING_FAIL; do
      for a in "$@"; do [ "$a" = "$h" ] && exit 1; done
    done
    exit "$rc" ;;
  getent) [ "$FAKE_DNS" = "fail" ] && exit 2; echo "157.240.1.1 graph.facebook.com"; exit "$rc" ;;
  ip)
    if [ "$rc" != 0 ]; then exit "$rc"; fi
    case "$*" in
      *addr*) [ "$FAKE_NO_IP" = "1" ] || echo "    inet 192.168.1.158/24 brd 192.168.1.255 scope global wlan0" ;;
      *route*) [ "$FAKE_NO_ROUTE" = "1" ] || echo "default via 192.168.1.1 dev wlan0 proto dhcp" ;;
    esac
    exit 0 ;;
  systemctl)
    if [ "$1" = "is-active" ]; then
      for u in $FAKE_ACTIVE; do [ "$u" = "\${@: -1}" ] && exit 0; done
      exit 3
    fi
    exit "$rc" ;;
  vcgencmd) echo "throttled=0x50005"; exit "$rc" ;;
  iw) echo "signal: -70 dBm"; exit "$rc" ;;
  *) exit "$rc" ;;
esac
`;

const COMMANDS = ["ping", "ip", "systemctl", "getent", "nmcli", "wpa_cli", "vcgencmd", "iw", "iwconfig"];

function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwd-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    for (const c of COMMANDS) {
        fs.writeFileSync(path.join(bin, c), FAKE, { mode: 0o755 });
    }
    const calls = path.join(dir, "calls.log");
    fs.writeFileSync(calls, "");
    const uptime = path.join(dir, "uptime");
    fs.writeFileSync(uptime, "5000.00 4000.00\n");
    const state = path.join(dir, "state", "net-watchdog.state");

    function run(env = {}, { initialFails } = {}) {
        if (initialFails !== undefined) {
            fs.mkdirSync(path.dirname(state), { recursive: true });
            fs.writeFileSync(state, `fails=${initialFails}\nsince=${1_000_000 - 60 * initialFails}\n`);
        }
        const r = spawnSync("bash", [SCRIPT], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: bin + path.delimiter + process.env.PATH,
                FAKE_CALLS: calls,
                NET_WATCHDOG_STATE: state,
                NET_WATCHDOG_UPTIME_FILE: uptime,
                NET_WATCHDOG_NOW: "1000000",
                FAKE_PING_FAIL: "",
                FAKE_ACTIVE: "",
                ...env,
            },
        });
        return {
            status: r.status,
            out: r.stdout + r.stderr,
            calls: fs.readFileSync(calls, "utf8"),
            state: fs.existsSync(state) ? fs.readFileSync(state, "utf8") : "",
        };
    }
    return { run, uptime, state, calls };
}

const NET_DOWN = { FAKE_PING_FAIL: "1.1.1.1 8.8.8.8 192.168.1.1", FAKE_DNS: "fail" };
const ACTIONS = /restart|reboot|reapply|reconfigure|link set/;
const failsOf = (s) => (/^fails=(\d+)$/m.exec(s) || [])[1];

test("red sana: no actua y sale 0", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run();
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.calls, ACTIONS);
    assert.ok(failsOf(r.state) === undefined || failsOf(r.state) === "0");
});

test("primer y segundo fallo: solo log", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    let r = run(NET_DOWN);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(failsOf(r.state), "1");
    r = run(NET_DOWN);
    assert.strictEqual(failsOf(r.state), "2");
    assert.doesNotMatch(r.calls, ACTIONS);
});

test("tercer fallo: recupera la wifi e indica el mecanismo", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_ACTIVE: "NetworkManager" }, { initialFails: 2 });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(failsOf(r.state), "3");
    assert.match(r.out, /NetworkManager/);
    assert.match(r.out, /throttled=0x50005/);
});

test("con NetworkManager: nmcli reapply", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_ACTIVE: "NetworkManager dhcpcd" }, { initialFails: 2 });
    assert.match(r.calls, /nmcli device reapply wlan0/);
    assert.doesNotMatch(r.calls, /restart dhcpcd/);
});

test("con NetworkManager y reapply falla: reinicia NetworkManager", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_ACTIVE: "NetworkManager", FAKE_RC_NMCLI: "1" }, { initialFails: 2 });
    assert.match(r.calls, /systemctl restart NetworkManager/);
});

test("con dhcpcd: reinicia dhcpcd", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_ACTIVE: "dhcpcd" }, { initialFails: 2 });
    assert.match(r.calls, /systemctl restart dhcpcd/);
    assert.doesNotMatch(r.calls, /nmcli/);
    assert.match(r.out, /dhcpcd/);
});

test("sin gestor: wpa_cli reconfigure", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run(NET_DOWN, { initialFails: 2 });
    assert.match(r.calls, /wpa_cli -i wlan0 reconfigure/);
    assert.match(r.out, /wpa_cli/);
});

test("sin gestor y wpa_cli falla: baja y sube la interfaz", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_RC_WPA_CLI: "1" }, { initialFails: 2 });
    assert.match(r.calls, /ip link set wlan0 down/);
    assert.match(r.calls, /ip link set wlan0 up/);
});

test("decimo fallo: reinicia y anota la marca", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run(NET_DOWN, { initialFails: 9 });
    assert.match(r.calls, /systemctl reboot/);
    assert.match(r.state, /last_reboot=1000000/);
});

test("segundo reinicio dentro de 6 h: no reinicia", { skip: skipReason }, (t) => {
    const { run, state } = setup(t);
    fs.mkdirSync(path.dirname(state), { recursive: true });
    fs.writeFileSync(state, `fails=11\nsince=1\nlast_reboot=${1_000_000 - 3600}\n`);
    const r = run(NET_DOWN);
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.calls, /systemctl reboot/);
    assert.match(r.out, /6 h/);
});

test("reinicio permitido pasadas las 6 h", { skip: skipReason }, (t) => {
    const { run, state } = setup(t);
    fs.mkdirSync(path.dirname(state), { recursive: true });
    fs.writeFileSync(state, `fails=11\nsince=1\nlast_reboot=${1_000_000 - 22000}\n`);
    const r = run(NET_DOWN);
    assert.match(r.calls, /systemctl reboot/);
});

test("uptime bajo (<3 min): no actua ni cuenta", { skip: skipReason }, (t) => {
    const { run, uptime } = setup(t);
    fs.writeFileSync(uptime, "100.00 90.00\n");
    const r = run(NET_DOWN, { initialFails: 9 });
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.calls, ACTIONS);
    assert.strictEqual(failsOf(r.state), "9");
});

test("uptime entre 3 y 15 min: no reinicia", { skip: skipReason }, (t) => {
    const { run, uptime } = setup(t);
    fs.writeFileSync(uptime, "600.00 500.00\n");
    const r = run(NET_DOWN, { initialFails: 9 });
    assert.doesNotMatch(r.calls, /systemctl reboot/);
});

test("simulacion: registra pero no ejecuta acciones", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    let r = run({ ...NET_DOWN, NET_WATCHDOG_DRY_RUN: "1", FAKE_ACTIVE: "NetworkManager" }, { initialFails: 2 });
    assert.doesNotMatch(r.calls, ACTIONS);
    assert.match(r.out, /simulaci/i);
    assert.match(r.out, /nmcli device reapply/);
    r = run({ ...NET_DOWN, NET_WATCHDOG_DRY_RUN: "1" }, { initialFails: 9 });
    assert.doesNotMatch(r.calls, ACTIONS);
    assert.match(r.out, /systemctl reboot/);
});

test("orden que falla o no existe: sale 0", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run(
        { FAKE_RC_IP: "127", FAKE_RC_PING: "127", FAKE_RC_GETENT: "127", FAKE_RC_SYSTEMCTL: "127" },
        { initialFails: 2 },
    );
    assert.strictEqual(r.status, 0);
});

test("la red vuelve: contador a cero y log de recuperacion", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({}, { initialFails: 4 });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(failsOf(r.state), "0");
    assert.match(r.out, /recuper/i);
    assert.match(r.out, /240 s/);
});

test("sin IP ni ruta: lo distingue en el log", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, FAKE_NO_IP: "1", FAKE_NO_ROUTE: "1" });
    assert.match(r.out, /sin IP/);
});

test("LAN bien pero sin internet: problema del router, no toca la wifi", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    // la puerta de enlace responde, internet no
    const r = run({ FAKE_PING_FAIL: "1.1.1.1 8.8.8.8", FAKE_DNS: "fail" }, { initialFails: 2 });
    assert.match(r.out, /router/);
    assert.strictEqual(failsOf(r.state), "2");
    assert.doesNotMatch(r.calls, ACTIONS);
});

test("DNS caido: recupera pero nunca reinicia, ni con 20 fallos", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    let r = run({ FAKE_DNS: "fail" }, { initialFails: 2 });
    assert.match(r.calls, /wpa_cli -i wlan0 reconfigure/);
    r = run({ FAKE_DNS: "fail" }, { initialFails: 19 });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(failsOf(r.state), "20");
    assert.doesNotMatch(r.calls, /systemctl reboot/);
    assert.match(r.out, /DNS/);
});

test("la recuperacion se reintenta en 3, 6 y 9 pero no en 4", { skip: skipReason }, (t) => {
    for (const [prev, expected] of [[2, true], [3, false], [5, true], [8, true]]) {
        const { run } = setup(t);
        const r = run(NET_DOWN, { initialFails: prev });
        assert.strictEqual(/wpa_cli -i wlan0 reconfigure/.test(r.calls), expected, `fallo ${prev + 1}`);
        assert.doesNotMatch(r.calls, /systemctl reboot/);
    }
});

test("RECOVER_AFTER=0 no divide por cero", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ ...NET_DOWN, NET_WATCHDOG_RECOVER_AFTER: "0" }, { initialFails: 2 });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(failsOf(r.state), "3");
});

test("fallos de router no cuentan: un wifi posterior empieza en 1 y no reinicia", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const router = { FAKE_PING_FAIL: "1.1.1.1 8.8.8.8", FAKE_DNS: "fail" };
    let r;
    for (let i = 0; i < 20; i++) r = run(router);
    assert.ok(failsOf(r.state) === "0");
    assert.match(r.state, /since=1000000/);
    assert.doesNotMatch(r.calls, ACTIONS);
    r = run(NET_DOWN);
    assert.strictEqual(failsOf(r.state), "1");
    assert.doesNotMatch(r.calls, ACTIONS);
});

test("internet bien pero DNS no: lo distingue", { skip: skipReason }, (t) => {
    const { run } = setup(t);
    const r = run({ FAKE_DNS: "fail" });
    assert.match(r.out, /DNS/);
    assert.strictEqual(failsOf(r.state), "1");
});
