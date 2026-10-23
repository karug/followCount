const test = require("node:test");
const assert = require("node:assert");

const KioskMonitor = require("../services/KioskMonitor");

function build(timing = { slideSeconds: 8, refreshSeconds: 60 }) {

    const clock = { now: 1_000_000 };

    const monitor = new KioskMonitor(() => timing, () => clock.now);

    return { monitor, clock };

}

test("threshold has a 180s floor", () => {

    const { monitor } = build();

    assert.strictEqual(monitor.thresholdSeconds(), 180);

});

test("threshold scales with the slowest of slide and refresh", () => {

    const { monitor } = build({ slideSeconds: 8, refreshSeconds: 120 });

    assert.strictEqual(monitor.thresholdSeconds(), 360);

});

test("threshold falls back to defaults when config is missing", () => {

    const { monitor } = build(null);

    assert.strictEqual(monitor.thresholdSeconds(), 180);

});

test("not stale before first heartbeat while backend is young", () => {

    const { monitor, clock } = build();

    clock.now += 100_000;

    const status = monitor.status();

    assert.strictEqual(status.stale, false);
    assert.strictEqual(status.lastHeartbeatAt, null);
    assert.strictEqual(status.ageSeconds, 100);

});

test("stale before first heartbeat once backend outlives the threshold", () => {

    const { monitor, clock } = build();

    clock.now += 181_000;

    assert.strictEqual(monitor.status().stale, true);

});

test("heartbeat resets age and stores the payload", () => {

    const { monitor, clock } = build();

    clock.now += 500_000;

    monitor.record({ slide: 2, visibility: "visible" });

    clock.now += 30_000;

    const status = monitor.status();

    assert.strictEqual(status.stale, false);
    assert.strictEqual(status.ageSeconds, 30);
    assert.deepStrictEqual(status.last, { slide: 2, visibility: "visible" });
    assert.strictEqual(status.lastHeartbeatAt, new Date(1_500_000).toISOString());

});

test("becomes stale when heartbeats stop", () => {

    const { monitor, clock } = build();

    monitor.record({ slide: 0 });

    clock.now += 181_000;

    assert.strictEqual(monitor.status().stale, true);

});
