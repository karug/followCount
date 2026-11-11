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

const metaError = (message) => Object.assign(new Error("400"), {
    response: { data: { error: { message } } }
});

const soonExp = Math.floor((NOW + 2 * HOUR) / 1000);

test("prepareForSave surfaces Meta's message on a 4xx from debug_token", async () => {

    const http = makeHttp({ debug: [metaError("Invalid app secret")] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("tok");

    assert.strictEqual(result.token, "tok");

    assert.match(result.warning, /Invalid app secret/);

});

test("inspect reports a network error without Meta body", async () => {

    const http = makeHttp({ debug: [new Error("timeout")] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    assert.deepStrictEqual(await service.inspect("tok"), {
        valid: null,
        expiresAt: null,
        error: "No se ha podido validar con Meta"
    });

});

test("prepareForSave keeps the original token when the exchange has no access_token", async () => {

    const http = makeHttp({ debug: [debugData({ expires_at: soonExp })], exchange: {} });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("short");

    assert.strictEqual(result.token, "short");

    assert.ok(result.warning);

});

test("prepareForSave keeps the original token when the extended one is invalid", async () => {

    const http = makeHttp({
        debug: [
            debugData({ expires_at: soonExp }),
            { data: { is_valid: false, error: { message: "Bad long token" } } }
        ]
    });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("short");

    assert.strictEqual(result.token, "short");

    assert.match(result.warning, /Bad long token/);

});

test("prepareForSave returns the new token when it cannot validate it", async () => {

    const http = makeHttp({ debug: [debugData({ expires_at: soonExp }), new Error("down")] });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("short");

    assert.strictEqual(result.token, "long");

    assert.ok(result.warning);

    assert.strictEqual(result.status.expiresAt, soonExp * 1000);

});

test("checkAll warns for near expiry and invalid tokens but not for far expiry", async (t) => {

    const warn = t.mock.method(console, "warn", () => {});

    const run = async (response) => {

        const before = warn.mock.callCount();

        const service = new MetaTokenService({
            settings: makeSettings({ ...APP, instagramAccessToken: "ig" }),
            http: makeHttp({ debug: [response] }),
            now: () => NOW
        });

        await service.checkAll();

        return warn.mock.callCount() - before;

    };

    assert.strictEqual(await run(debugData({ expires_at: Math.floor((NOW + 10 * DAY) / 1000) })), 1);

    assert.strictEqual(await run({ data: { is_valid: false, error: { message: "x" } } }), 1);

    assert.strictEqual(await run(debugData({ expires_at: Math.floor((NOW + 60 * DAY) / 1000) })), 0);

});

test("checkAll keeps the last known expiry when the check is inconclusive", async (t) => {

    const warn = t.mock.method(console, "warn", () => {});

    const exp = Math.floor((NOW + 60 * DAY) / 1000);

    const settings = makeSettings({ ...APP, instagramAccessToken: "ig" });

    const http = makeHttp({ debug: [debugData({ expires_at: exp }), new Error("down")] });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    await service.checkAll();

    const status = service.status().instagram;

    assert.strictEqual(status.valid, null);

    assert.strictEqual(status.expiresAt, exp * 1000);

    assert.strictEqual(status.error, "No se ha podido validar con Meta");

    assert.strictEqual(warn.mock.callCount(), 1);

});

test("prepareForSave y inspect dan prioridad a las credenciales pasadas", async () => {

    const soon = NOW + DAY;

    const http = makeHttp({
        debug: [debugData({ expires_at: soon / 1000 }), debugData({ expires_at: 0 })]
    });

    const service = new MetaTokenService({ settings: makeSettings(APP), http, now: () => NOW });

    const result = await service.prepareForSave("short", { appId: "newId", appSecret: "newSecret" });

    assert.strictEqual(result.token, "long");
    assert.ok(http.calls.every(c => c.params.access_token === undefined || c.params.access_token === "newId|newSecret"));

    const exchange = http.calls.find(c => c.params.grant_type === "fb_exchange_token");

    assert.strictEqual(exchange.params.client_id, "newId");
    assert.strictEqual(exchange.params.client_secret, "newSecret");

});

test("checkAll no guarda el estado de un token que ya fue sustituido", async () => {

    const settings = makeSettings({ ...APP, instagramAccessToken: "old" });

    const http = makeHttp({ debug: [debugData({ expires_at: 0 })] });

    // Replace the token while the check for the old one is in flight
    const getJson = http.getJson.bind(http);

    http.getJson = async (url, options) => {

        const result = await getJson(url, options);

        settings.update({ secrets: { instagramAccessToken: "new" } });

        return result;

    };

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(service.status().instagram, undefined);

});

const laterExp = Math.floor((NOW + 60 * DAY) / 1000);

const igSettings = (extra = {}) => makeSettings({ ...APP, instagramAccessToken: "short", ...extra });

test("checkAll renueva y guarda el token que caduca en menos de 7 días", async (t) => {

    t.mock.method(console, "log", () => {});

    const settings = igSettings();

    const http = makeHttp({
        debug: [debugData({ expires_at: soonExp }), debugData({ expires_at: laterExp })]
    });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(settings.secret("instagramAccessToken"), "long");

    const status = service.status().instagram;

    assert.strictEqual(status.expiresAt, laterExp * 1000);

    assert.deepStrictEqual(Object.keys(status).sort(), ["checkedAt", "error", "expiresAt", "valid"]);

});

test("checkAll no renueva ni llama a oauth/access_token cuando caduca lejos", async () => {

    const settings = igSettings();

    const http = makeHttp({ debug: [debugData({ expires_at: laterExp })] });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.ok(!http.calls.some((c) => c.url.endsWith("/oauth/access_token")));

    assert.strictEqual(settings.secret("instagramAccessToken"), "short");

});

test("checkAll conserva el token y su status si el intercambio falla", async (t) => {

    const warn = t.mock.method(console, "warn", () => {});

    const settings = igSettings();

    const http = makeHttp({ debug: [debugData({ expires_at: soonExp })], exchange: {} });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(settings.secret("instagramAccessToken"), "short");

    assert.strictEqual(service.status().instagram.expiresAt, soonExp * 1000);

    assert.ok(warn.mock.callCount() >= 1);

});

test("checkAll conserva el original si el token renovado resulta inválido", async (t) => {

    t.mock.method(console, "warn", () => {});

    const settings = igSettings();

    const http = makeHttp({
        debug: [
            debugData({ expires_at: soonExp }),
            { data: { is_valid: false, error: { message: "Bad long token" } } }
        ]
    });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(settings.secret("instagramAccessToken"), "short");

    assert.strictEqual(service.status().instagram.valid, true);

    assert.strictEqual(service.status().instagram.expiresAt, soonExp * 1000);

});

test("checkAll con token inválido no intenta renovar, no lanza y guarda valid false", async (t) => {

    t.mock.method(console, "warn", () => {});

    const settings = igSettings();

    const http = makeHttp({ debug: [{ data: { is_valid: false, error: { message: "Expired" } } }] });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.ok(!http.calls.some((c) => c.url.endsWith("/oauth/access_token")));

    assert.strictEqual(service.status().instagram.valid, false);

    assert.strictEqual(settings.secret("instagramAccessToken"), "short");

});

test("checkAll no renueva cuando no se pudo comprobar el token", async (t) => {

    t.mock.method(console, "warn", () => {});

    const settings = igSettings();

    const http = makeHttp({ debug: [new Error("down")] });

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.ok(!http.calls.some((c) => c.url.endsWith("/oauth/access_token")));

    assert.strictEqual(service.status().instagram.valid, null);

});

test("checkAll no pisa un token sustituido durante la renovación", async (t) => {

    t.mock.method(console, "log", () => {});

    const settings = igSettings();

    const http = makeHttp({
        debug: [debugData({ expires_at: soonExp }), debugData({ expires_at: laterExp })]
    });

    const getJson = http.getJson.bind(http);

    http.getJson = async (url, options) => {

        const result = await getJson(url, options);

        if (url.endsWith("/oauth/access_token")) {

            settings.update({ secrets: { instagramAccessToken: "manual" } });

        }

        return result;

    };

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(settings.secret("instagramAccessToken"), "manual");

    assert.strictEqual(service.status().instagram, undefined);

});

test("checkAll sigue con facebook aunque falle la renovación de instagram", async (t) => {

    t.mock.method(console, "warn", () => {});

    t.mock.method(console, "log", () => {});

    const settings = igSettings({ facebookAccessToken: "fbshort" });

    const http = makeHttp({
        debug: [
            debugData({ expires_at: soonExp }),
            debugData({ expires_at: soonExp }),
            debugData({ expires_at: laterExp })
        ]
    });

    const getJson = http.getJson.bind(http);

    http.getJson = async (url, options) => {

        if (url.endsWith("/oauth/access_token") && options.params.fb_exchange_token === "short") {

            throw new Error("boom");

        }

        return getJson(url, options);

    };

    const service = new MetaTokenService({ settings, http, now: () => NOW });

    await service.checkAll();

    assert.strictEqual(settings.secret("instagramAccessToken"), "short");

    assert.strictEqual(settings.secret("facebookAccessToken"), "long");

    assert.strictEqual(service.status().facebook.expiresAt, laterExp * 1000);

    assert.ok(service.status().instagram);

});

test("checkAll no imprime el token en los logs", async (t) => {

    const log = t.mock.method(console, "log", () => {});

    const warn = t.mock.method(console, "warn", () => {});

    const http = makeHttp({
        debug: [debugData({ expires_at: soonExp }), debugData({ expires_at: laterExp })]
    });

    const service = new MetaTokenService({ settings: igSettings(), http, now: () => NOW });

    await service.checkAll();

    const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);

    assert.ok(!output.includes("short"));

    assert.ok(!output.includes('"long"'));

});
