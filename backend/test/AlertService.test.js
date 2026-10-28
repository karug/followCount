const test = require("node:test");
const assert = require("node:assert");

const AlertService = require("../services/AlertService");

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const CHANNEL = { type: "github", repo: "a/b" };

const KEY = "metric:" + JSON.stringify(CHANNEL);

const HEALTHY_SYSTEM = {
    read: async () => ({ undervoltageNow: false, undervoltageSinceBoot: false })
};

function build({ tokens = {}, health = new Map(), channels = [CHANNEL], system = HEALTHY_SYSTEM } = {}) {

    return new AlertService({
        metaTokens: { status: () => tokens },
        dashboard: {
            channelHealth: health,
            config: { projects: [{ name: "P", channels }] }
        },
        system,
        now: () => NOW
    });

}

test("no alerts when everything is healthy", async () => {

    const tokens = {
        instagram: { valid: true, expiresAt: NOW + 60 * DAY },
        facebook: { valid: true, expiresAt: null }
    };

    assert.deepStrictEqual(await build({ tokens }).codes(), []);

});

test("meta-token-invalid when a token is invalid", async () => {

    const tokens = { instagram: { valid: false, expiresAt: null } };

    assert.deepStrictEqual(await build({ tokens }).codes(), ["meta-token-invalid"]);

});

test("unknown token state (valid null) does not alert", async () => {

    const tokens = { instagram: { valid: null, expiresAt: null } };

    assert.deepStrictEqual(await build({ tokens }).codes(), []);

});

test("meta-token-expiring when a token expires in under 14 days", async () => {

    const tokens = { facebook: { valid: true, expiresAt: NOW + 13 * DAY } };

    assert.deepStrictEqual(await build({ tokens }).codes(), ["meta-token-expiring"]);

});

test("token expiring in 15 days does not alert", async () => {

    const tokens = { facebook: { valid: true, expiresAt: NOW + 15 * DAY } };

    assert.deepStrictEqual(await build({ tokens }).codes(), []);

});

test("channel failing 23 h does not alert, 25 h does", async () => {

    const failing = (hours) => new Map([[
        KEY,
        { failingSince: NOW - hours * HOUR, lastError: "x", lastSuccessAt: null }
    ]]);

    assert.deepStrictEqual(await build({ health: failing(23) }).codes(), []);

    assert.deepStrictEqual(await build({ health: failing(25) }).codes(), ["channel-failing"]);

});

test("healthy channel (failingSince null) does not alert", async () => {

    const health = new Map([[
        KEY,
        { failingSince: null, lastError: null, lastSuccessAt: NOW }
    ]]);

    assert.deepStrictEqual(await build({ health }).codes(), []);

});

test("failing channel removed from the config does not alert", async () => {

    const health = new Map([[
        KEY,
        { failingSince: NOW - 48 * HOUR, lastError: "x", lastSuccessAt: null }
    ]]);

    assert.deepStrictEqual(await build({ health, channels: [] }).codes(), []);

});

test("undervoltage when now or since boot", async () => {

    const now = { read: async () => ({ undervoltageNow: true, undervoltageSinceBoot: false }) };
    const boot = { read: async () => ({ undervoltageNow: false, undervoltageSinceBoot: true }) };

    assert.deepStrictEqual(await build({ system: now }).codes(), ["undervoltage"]);
    assert.deepStrictEqual(await build({ system: boot }).codes(), ["undervoltage"]);

});

test("codes come in the documented order", async () => {

    const tokens = {
        instagram: { valid: false, expiresAt: NOW + DAY },
        facebook: { valid: true, expiresAt: NOW + DAY }
    };

    const health = new Map([[
        KEY,
        { failingSince: NOW - 30 * HOUR, lastError: "x", lastSuccessAt: null }
    ]]);

    const system = { read: async () => ({ undervoltageNow: true, undervoltageSinceBoot: true }) };

    assert.deepStrictEqual(
        await build({ tokens, health, system }).codes(),
        ["meta-token-invalid", "meta-token-expiring", "channel-failing", "undervoltage"]
    );

});
