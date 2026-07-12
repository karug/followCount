process.env.YOUTUBE_API_KEY ??= "test-key";

const test = require("node:test");
const assert = require("node:assert");

const DashboardService = require("../services/DashboardService");
const Metric = require("../models/Metric");

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

function makeService() {

    const service = new DashboardService();

    service.config = { refreshSeconds: 60 };

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
