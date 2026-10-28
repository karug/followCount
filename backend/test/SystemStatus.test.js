const test = require("node:test");
const assert = require("node:assert");

const SystemStatus = require("../services/SystemStatus");

function fakeRun(outputs) {

    const calls = [];

    const run = async (file, args) => {

        calls.push([file, ...args]);

        const key = args.join(" ");

        if (!(key in outputs)) {

            throw new Error("ENOENT");

        }

        return { stdout: outputs[key] };

    };

    run.calls = calls;

    return run;

}

const OK = {
    "get_throttled": "throttled=0x50005\n",
    "measure_clock arm": "frequency(48)=1500398464\n"
};

test("SystemStatus parses throttled=0x50005", async () => {

    const system = new SystemStatus({ run: fakeRun(OK) });

    const status = await system.read();

    assert.strictEqual(status.available, true);
    assert.strictEqual(status.undervoltageNow, true);
    assert.strictEqual(status.throttledNow, true);
    assert.strictEqual(status.undervoltageSinceBoot, true);
    assert.strictEqual(status.raw, "0x50005");
    assert.strictEqual(status.armHz, 1500398464);

});

test("SystemStatus reports healthy for throttled=0x0", async () => {

    const system = new SystemStatus({
        run: fakeRun({ ...OK, "get_throttled": "throttled=0x0\n" })
    });

    const status = await system.read();

    assert.strictEqual(status.available, true);
    assert.strictEqual(status.undervoltageNow, false);
    assert.strictEqual(status.throttledNow, false);
    assert.strictEqual(status.undervoltageSinceBoot, false);

});

test("SystemStatus without vcgencmd is unavailable", async () => {

    const system = new SystemStatus({ run: fakeRun({}) });

    const status = await system.read();

    assert.strictEqual(status.available, false);
    assert.strictEqual(status.undervoltageNow, false);
    assert.strictEqual(status.undervoltageSinceBoot, false);
    assert.strictEqual(status.throttledNow, false);
    assert.strictEqual(status.raw, null);
    assert.strictEqual(status.armHz, null);

});

test("SystemStatus caches for 30 seconds", async () => {

    let now = 1_000_000;

    const run = fakeRun(OK);

    const system = new SystemStatus({ run, now: () => now });

    await system.read();

    const callsAfterFirst = run.calls.length;

    now += 29_000;

    await system.read();

    assert.strictEqual(run.calls.length, callsAfterFirst);

    now += 2_000;

    await system.read();

    assert.ok(run.calls.length > callsAfterFirst);

});
