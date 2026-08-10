const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const InstagramTokenService = require("../services/InstagramTokenService");

function makeService() {

    const Service = InstagramTokenService.constructor;

    const service = new Service();

    service.tokenFile = path.join(
        os.tmpdir(),
        `followcount-token-test-${process.pid}-${Math.random()}.json`
    );

    return service;

}

test("load() falls back to env var when no token file exists", () => {

    const service = makeService();

    process.env.INSTAGRAM_ACCESS_TOKEN = "env-token";

    service.load();

    assert.strictEqual(service.getToken(), "env-token");

    delete process.env.INSTAGRAM_ACCESS_TOKEN;

});

test("load() prefers a persisted token over the env var", () => {

    const service = makeService();

    fs.writeFileSync(
        service.tokenFile,
        JSON.stringify({ token: "persisted-token", refreshedAt: "x" })
    );

    process.env.INSTAGRAM_ACCESS_TOKEN = "env-token";

    service.load();

    assert.strictEqual(service.getToken(), "persisted-token");

    delete process.env.INSTAGRAM_ACCESS_TOKEN;

    fs.rmSync(service.tokenFile, { force: true });

});

test("refresh() is a no-op without app id/secret", async () => {

    const service = makeService();

    service.token = "some-token";

    service.appId = null;

    service.appSecret = null;

    const refreshed = await service.refresh();

    assert.strictEqual(refreshed, false);

    assert.strictEqual(service.token, "some-token");

});

test("refresh() is a no-op without a token to exchange", async () => {

    const service = makeService();

    service.token = null;

    service.appId = "id";

    service.appSecret = "secret";

    const refreshed = await service.refresh();

    assert.strictEqual(refreshed, false);

});

test("status() reports configuration and last error", () => {

    const service = makeService();

    service.token = "x";

    service.appId = "id";

    service.appSecret = "secret";

    service.lastError = "boom";

    assert.deepStrictEqual(service.status(), {

        hasToken: true,

        autoRefreshConfigured: true,

        lastRefreshAt: null,

        lastError: "boom"

    });

});
