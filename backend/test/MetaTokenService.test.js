const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const MetaTokenService = require("../services/MetaTokenService");
const { SettingsService } = require("../services/SettingsService");

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function makeSettings(secrets = {}) {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-token-"));

    const legacyConfigFile = path.join(dir, "config.json");

    fs.writeFileSync(legacyConfigFile, JSON.stringify({ projects: [] }));

    const settings = new SettingsService({
        file: path.join(dir, "settings.json"),
        legacyConfigFile,
        legacyTokenFile: path.join(dir, "none.json"),
        env: {}
    });

    settings.load();

    settings.update({ secrets });

    return settings;

}

// Fake http: debug_token answers come from a queue, exchange from `exchange`.
function makeHttp({ debug = [], exchange = { access_token: "long" } } = {}) {

    const calls = [];

    const queue = [...debug];

    return {

        calls,

        async getJson(url, { params }) {

            calls.push({ url, params });

            if (url.endsWith("/debug_token")) {

                const next = queue.shift();

                if (next instanceof Error) {

                    throw next;

                }

                return next;

            }

            return exchange;

        }

    };

}

const debugData = (data) => ({ data: { is_valid: true, ...data } });

const APP = { facebookAppId: "id", facebookAppSecret: "secret" };

test("inspect treats expires_at 0 as never expiring", async () => {

    const http = makeHttp({ debug: [debugData({ expires_at: 0 })] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.inspect("tok");

    assert.deepStrictEqual(result, { valid: true, expiresAt: null, error: null });

    assert.strictEqual(http.calls[0].params.input_token, "tok");

    assert.strictEqual(http.calls[0].params.access_token, "id|secret");

});

test("inspect converts expires_at seconds to milliseconds", async () => {

    const http = makeHttp({ debug: [debugData({ expires_at: 1_800_000_100 })] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    assert.strictEqual((await service.inspect("tok")).expiresAt, 1_800_000_100_000);

});

test("inspect returns unknown without app id/secret", async () => {

    const http = makeHttp();

    const service = new MetaTokenService({ settings: makeSettings(), http, now: () => NOW });

    const result = await service.inspect("tok");

    assert.deepStrictEqual(result, {
        valid: null,
        expiresAt: null,
        error: "Sin App ID/secret: no se puede comprobar"
    });

    assert.strictEqual(http.calls.length, 0);

});

test("prepareForSave exchanges a short-lived token", async () => {

    const soon = Math.floor((NOW + 2 * HOUR) / 1000);

    const later = Math.floor((NOW + 60 * DAY) / 1000);

    const http = makeHttp({
        debug: [debugData({ expires_at: soon }), debugData({ expires_at: later })]
    });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("short");

    assert.strictEqual(result.token, "long");

    assert.strictEqual(result.warning, null);

    assert.strictEqual(result.status.expiresAt, later * 1000);

    const exchange = http.calls.find((c) => c.params.grant_type === "fb_exchange_token");

    assert.strictEqual(exchange.params.fb_exchange_token, "short");

});

test("prepareForSave warns when it cannot extend the token", async () => {

    const soon = Math.floor((NOW + 2 * HOUR) / 1000);

    const http = makeHttp({ debug: [debugData({ expires_at: soon })] });

    const service = new MetaTokenService({
        settings: makeSettings({ facebookAppId: "id" }),
        http,
        now: () => NOW
    });

    const result = await service.prepareForSave("short");

    assert.strictEqual(result.token, "short");

    assert.ok(result.warning);

});

test("prepareForSave rejects an invalid token with Meta's message", async () => {

    const http = makeHttp({
        debug: [{ data: { is_valid: false, error: { message: "Session expired" } } }]
    });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    await assert.rejects(service.prepareForSave("bad"), { message: "Session expired" });

});

test("prepareForSave returns the token unchanged when the network fails", async () => {

    const http = makeHttp({ debug: [new Error("ECONNRESET")] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("tok");

    assert.strictEqual(result.token, "tok");

    assert.strictEqual(result.warning, "No se ha podido validar con Meta");

});

test("checkAll stores the status of both tokens", async () => {

    const exp = Math.floor((NOW + 60 * DAY) / 1000);

    const http = makeHttp({ debug: [debugData({ expires_at: exp }), debugData({ expires_at: 0 })] });

    const settings = makeSettings({
        ...APP,
        instagramAccessToken: "ig",
        facebookAccessToken: "fb"
    });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    const status = service.status();

    assert.strictEqual(status.instagram.valid, true);

    assert.strictEqual(status.instagram.expiresAt, exp * 1000);

    assert.strictEqual(status.instagram.checkedAt, NOW);

    assert.strictEqual(status.facebook.expiresAt, null);

    assert.strictEqual(status.facebook.valid, true);

});

test("checkAll skips the facebook token when absent", async () => {

    const http = makeHttp({ debug: [debugData({ expires_at: 0 })] });

    const settings = makeSettings({ ...APP, instagramAccessToken: "ig" });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.ok(service.status().instagram);

    assert.strictEqual(service.status().facebook, undefined);

});
