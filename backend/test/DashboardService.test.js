const test = require("node:test");
const assert = require("node:assert");

const DashboardService = require("../services/DashboardService");
const { SettingsService } = require("../services/SettingsService");
const Metric = require("../models/Metric");

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

function makeSettings(config = { refreshSeconds: 60, projects: [] }) {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-settings-"));

    const legacyConfigFile = path.join(dir, "config.json");

    fs.writeFileSync(legacyConfigFile, JSON.stringify(config));

    const settings = new SettingsService({
        file: path.join(dir, "settings.json"),
        legacyConfigFile,
        legacyTokenFile: path.join(dir, "none.json"),
        env: {}
    });

    settings.load();

    return settings;

}

function makeService(settings = makeSettings()) {

    const service = new DashboardService(settings);

    // Keep test runs from touching the real persisted metrics.
    service.lastGoodFile = path.join(
        os.tmpdir(),
        `followcount-test-${process.pid}-${Math.random()}.json`
    );

    return service;

}

test("fetchMetric caches per channel", async () => {

    const service = makeService();

    let calls = 0;

    const provider = {

        fetch: async () => {

            calls++;

            return new Metric({
                type: "fake",
                label: "x",
                value: calls
            });

        }

    };

    const channel = { type: "fake", username: "a" };

    const first = await service.fetchMetric(provider, channel);

    const second = await service.fetchMetric(provider, channel);

    assert.strictEqual(calls, 1);

    assert.strictEqual(first, second);

});

test("fetchMetric serves last known value on provider failure", async () => {

    const service = makeService();

    let fail = false;

    const provider = {

        fetch: async () => {

            if (fail) {

                throw new Error("boom");

            }

            return new Metric({
                type: "fake",
                label: "x",
                value: 9
            });

        }

    };

    const channel = { type: "fake", username: "a" };

    await service.fetchMetric(provider, channel);

    service.cache.clear();

    fail = true;

    const metric = await service.fetchMetric(provider, channel);

    assert.strictEqual(metric.value, 9);

});

test("fetchMetric propagates failure without a previous value", async () => {

    const service = makeService();

    const provider = {

        fetch: async () => {

            throw new Error("boom");

        }

    };

    await assert.rejects(
        () => service.fetchMetric(provider, { type: "fake" }),
        /boom/
    );

});

test("fetchMetric applies a cooldown after failure", async () => {

    const service = makeService();

    let calls = 0;

    const provider = {

        fetch: async () => {

            calls++;

            throw new Error("boom");

        }

    };

    const channel = { type: "fake", username: "a" };

    await assert.rejects(
        () => service.fetchMetric(provider, channel)
    );

    await assert.rejects(
        () => service.fetchMetric(provider, channel),
        /cooldown/
    );

    assert.strictEqual(calls, 1);

});

test("last known metrics survive a restart via persistence", async () => {

    const service = makeService();

    const provider = {

        fetch: async () => new Metric({
            type: "fake",
            label: "x",
            value: 7
        })

    };

    const channel = { type: "fake", username: "a" };

    await service.fetchMetric(provider, channel);

    const reborn = makeService();

    reborn.lastGoodFile = service.lastGoodFile;

    reborn.loadLastGood();

    const failing = {

        fetch: async () => {

            throw new Error("boom");

        }

    };

    const metric = await reborn.fetchMetric(failing, channel);

    assert.strictEqual(metric.value, 7);

    fs.rmSync(service.lastGoodFile, { force: true });

});

test("buildProject skips failing channels and picks first logo", async () => {

    const service = makeService();

    service.providers = {

        get: type => ({

            ok: {

                fetch: async () => new Metric({
                    type: "ok",
                    label: "x",
                    value: 1,
                    logo: "https://example.com/a.png"
                })

            },

            broken: {

                fetch: async () => {

                    throw new Error("boom");

                }

            }

        })[type]

    };

    service.logoService = {

        resolve: async url => url

    };

    const project = await service.buildProject({

        name: "Test",

        primaryChannel: "ok",

        channels: [
            { type: "ok" },
            { type: "broken" },
            { type: "unknown" }
        ]

    });

    assert.strictEqual(project.metrics.length, 1);

    assert.strictEqual(project.logo, "https://example.com/a.png");

    assert.strictEqual(project.primary, "ok");

});


test("a config change clears the dashboard cache", async () => {

    const settings = makeSettings({ refreshSeconds: 60, projects: [] });

    const service = makeService(settings);

    const first = await service.build();

    assert.strictEqual(first.projects.length, 0);

    settings.update({
        config: { projects: [{ name: "Nuevo", channels: [] }] }
    });

    const second = await service.build();

    assert.deepStrictEqual(
        second.projects.map(project => project.name),
        ["Nuevo"]
    );

});

test("channelHealth marca failingSince y lo limpia al recuperar", async () => {

    const service = makeService();

    let fail = true;

    const provider = {

        fetch: async () => {

            if (fail) {

                throw new Error("boom");

            }

            return new Metric({ type: "fake", label: "x", value: 1 });

        }

    };

    const channel = { type: "fake", username: "a" };

    const key = "metric:" + JSON.stringify(channel);

    await assert.rejects(() => service.fetchMetric(provider, channel));

    const failing = service.channelHealth.get(key);

    assert.ok(failing.failingSince > 0);

    assert.strictEqual(failing.lastError, "boom");

    assert.strictEqual(failing.lastSuccessAt, null);

    service.cache.clear();

    await assert.rejects(() => service.fetchMetric(provider, channel));

    assert.strictEqual(
        service.channelHealth.get(key).failingSince,
        failing.failingSince
    );

    service.cache.clear();

    fail = false;

    await service.fetchMetric(provider, channel);

    const recovered = service.channelHealth.get(key);

    assert.strictEqual(recovered.failingSince, null);

    assert.ok(recovered.lastSuccessAt > 0);

});
