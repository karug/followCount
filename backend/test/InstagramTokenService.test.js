const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const InstagramTokenService = require("../services/InstagramTokenService");
const Http = require("../utils/Http");
const { SettingsService } = require("../services/SettingsService");

function makeService(secrets = {}) {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "token-settings-"));

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

    const Service = InstagramTokenService.constructor;

    return { settings, service: new Service(settings) };

}

test("getToken() reads the token from settings", () => {

    const { settings, service } = makeService({ instagramAccessToken: "t1" });

    assert.strictEqual(service.getToken(), "t1");

    settings.update({ secrets: { instagramAccessToken: "t2" } });

    assert.strictEqual(service.getToken(), "t2");

});

test("refresh() is a no-op without app id/secret", async () => {

    const { settings, service } = makeService({ instagramAccessToken: "some-token" });

    const refreshed = await service.refresh();

    assert.strictEqual(refreshed, false);

    assert.strictEqual(settings.secret("instagramAccessToken"), "some-token");

});

test("refresh() is a no-op without a token to exchange", async () => {

    const { service } = makeService({
        facebookAppId: "id",
        facebookAppSecret: "secret"
    });

    const refreshed = await service.refresh();

    assert.strictEqual(refreshed, false);

});

test("refresh() stores the renewed token in settings", async t => {

    const { settings, service } = makeService({
        instagramAccessToken: "old",
        facebookAppId: "id",
        facebookAppSecret: "secret"
    });

    t.mock.method(Http, "getJson", async () => ({
        access_token: "new",
        expires_in: 100
    }));

    const refreshed = await service.refresh();

    assert.strictEqual(refreshed, true);

    assert.strictEqual(settings.secret("instagramAccessToken"), "new");

    assert.ok(service.lastRefreshAt);

});

test("status() reports configuration and last error", () => {

    const { service } = makeService({
        instagramAccessToken: "x",
        facebookAppId: "id",
        facebookAppSecret: "secret"
    });

    service.lastError = "boom";

    assert.deepStrictEqual(service.status(), {

        hasToken: true,

        autoRefreshConfigured: true,

        lastRefreshAt: null,

        lastError: "boom"

    });

});
