const test = require("node:test");
const assert = require("node:assert");

const AdminAuth = require("../services/AdminAuth");
const { startServer, tempSettings } = require("./helpers/server");

const NOW = 1_800_000_000_000;

const TTL_MS = 12 * 3600 * 1000;

function post(url, body) {

    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

}

function cookieOf(response) {

    return response.headers.get("set-cookie").split(";")[0];

}

test("hashPassword and verifyPassword round trip", () => {

    const { settings } = tempSettings();
    const auth = new AdminAuth({ settings });

    const stored = auth.hashPassword("correct horse");

    assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.strictEqual(auth.verifyPassword("correct horse", stored), true);
    assert.strictEqual(auth.verifyPassword("wrong", stored), false);
    assert.strictEqual(auth.verifyPassword("x", "garbage"), false);
    assert.strictEqual(auth.verifyPassword("x", null), false);

});

test("session reports needsSetup until a password exists", async () => {

    const server = await startServer();

    try {

        const before = await (await fetch(`${server.url}/api/admin/session`)).json();

        assert.deepStrictEqual(before, { needsSetup: true, authenticated: false });

        const setup = await post(`${server.url}/api/admin/setup`, { password: "longenough" });

        assert.strictEqual(setup.status, 200);

        const after = await (await fetch(`${server.url}/api/admin/session`, {
            headers: { Cookie: cookieOf(setup) }
        })).json();

        assert.deepStrictEqual(after, { needsSetup: false, authenticated: true });

    } finally {

        await server.close();

    }

});

test("setup solo una vez", async () => {

    const server = await startServer();

    try {

        const first = await post(`${server.url}/api/admin/setup`, { password: "longenough" });

        assert.strictEqual(first.status, 200);

        const cookie = first.headers.get("set-cookie");

        assert.match(cookie, /^fc_admin=/);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        assert.match(cookie, /Path=\//);
        assert.match(cookie, /Max-Age=43200/);
        assert.doesNotMatch(cookie, /Secure/);

        const second = await post(`${server.url}/api/admin/setup`, { password: "anotherpass" });

        assert.strictEqual(second.status, 409);

    } finally {

        await server.close();

    }

});

test("setup rejects short passwords", async () => {

    const server = await startServer();

    try {

        const response = await post(`${server.url}/api/admin/setup`, { password: "short" });

        assert.strictEqual(response.status, 400);

        const session = await (await fetch(`${server.url}/api/admin/session`)).json();

        assert.strictEqual(session.needsSetup, true);

    } finally {

        await server.close();

    }

});

test("login con contraseña mala da 401", async () => {

    const server = await startServer();

    try {

        await post(`${server.url}/api/admin/setup`, { password: "longenough" });

        const bad = await post(`${server.url}/api/admin/login`, { password: "nope" });

        assert.strictEqual(bad.status, 401);
        assert.strictEqual(bad.headers.get("set-cookie"), null);

        const missing = await post(`${server.url}/api/admin/login`, {});

        assert.strictEqual(missing.status, 401);

        const good = await post(`${server.url}/api/admin/login`, { password: "longenough" });

        assert.strictEqual(good.status, 200);
        assert.match(good.headers.get("set-cookie"), /^fc_admin=/);

    } finally {

        await server.close();

    }

});

test("login before setup is rejected", async () => {

    const server = await startServer();

    try {

        const response = await post(`${server.url}/api/admin/login`, { password: "anything1" });

        assert.strictEqual(response.status, 401);

    } finally {

        await server.close();

    }

});

test("logout clears the cookie", async () => {

    const server = await startServer();

    try {

        const response = await post(`${server.url}/api/admin/logout`, {});

        assert.strictEqual(response.status, 200);
        assert.match(response.headers.get("set-cookie"), /^fc_admin=;.*Max-Age=0/);

    } finally {

        await server.close();

    }

});

test("requireSession rejects missing, expired and tampered cookies", () => {

    const { settings } = tempSettings();
    let now = NOW;
    const auth = new AdminAuth({ settings, now: () => now });

    function run(cookie) {

        const req = { headers: cookie ? { cookie } : {} };
        const result = { status: null, body: null, nexted: false };
        const res = {
            status(code) { result.status = code; return this; },
            json(body) { result.body = body; return this; }
        };

        auth.requireSession(req, res, () => { result.nexted = true; });

        return result;

    }

    const valid = auth.issueCookie();

    assert.strictEqual(run(`other=1; fc_admin=${valid}`).nexted, true);

    const missing = run(null);

    assert.strictEqual(missing.status, 401);
    assert.deepStrictEqual(missing.body, { error: "auth" });

    const [exp, sig] = valid.split(".");

    assert.strictEqual(run(`fc_admin=${Number(exp) + 1000}.${sig}`).status, 401);
    assert.strictEqual(run("fc_admin=garbage").status, 401);

    now = NOW + TTL_MS + 1;

    assert.strictEqual(run(`fc_admin=${valid}`).status, 401);

});

test("cookie caducada da 401", async () => {

    let now = NOW;
    const { settings } = tempSettings();
    const auth = new AdminAuth({ settings, now: () => now });

    settings.update({ admin: { passwordHash: auth.hashPassword("longenough") } });

    const server = await startServer({ settings, now: () => now });

    try {

        const login = await post(`${server.url}/api/admin/login`, { password: "longenough" });
        const cookie = cookieOf(login);

        const fresh = await (await fetch(`${server.url}/api/admin/session`, {
            headers: { Cookie: cookie }
        })).json();

        assert.strictEqual(fresh.authenticated, true);

        now += TTL_MS + 1;

        const stale = await (await fetch(`${server.url}/api/admin/session`, {
            headers: { Cookie: cookie }
        })).json();

        assert.strictEqual(stale.authenticated, false);

    } finally {

        await server.close();

    }

});

test("cookie manipulada da 401", async () => {

    const server = await startServer();

    try {

        const setup = await post(`${server.url}/api/admin/setup`, { password: "longenough" });
        const [name, value] = cookieOf(setup).split("=");
        const [exp, sig] = value.split(".");

        const forged = `${name}=${Number(exp) + 3600000}.${sig}`;

        const session = await (await fetch(`${server.url}/api/admin/session`, {
            headers: { Cookie: forged }
        })).json();

        assert.strictEqual(session.authenticated, false);

    } finally {

        await server.close();

    }

});

test("las rutas públicas siguen sin pedir sesión", async () => {

    const server = await startServer();

    try {

        for (const route of ["/api/kiosk", "/api/health", "/api/dashboard"]) {

            const response = await fetch(`${server.url}${route}`);

            assert.strictEqual(response.status, 200, route);

        }

        const heartbeat = await post(`${server.url}/api/heartbeat`, {});

        assert.strictEqual(heartbeat.status, 204);

    } finally {

        await server.close();

    }

});

test("/api/dashboard includes alerts", async () => {

    const server = await startServer({
        alertService: { codes: async () => ["undervoltage"] }
    });

    try {

        const body = await (await fetch(`${server.url}/api/dashboard`)).json();

        assert.deepStrictEqual(body.alerts, ["undervoltage"]);
        assert.deepStrictEqual(body.projects, []);

    } finally {

        await server.close();

    }

});

test("/api/dashboard survives alertService.codes() throwing", async () => {

    const originalError = console.error;
    console.error = () => {};

    const server = await startServer({
        alertService: { codes: async () => { throw new Error("boom"); } }
    });

    try {

        const response = await fetch(`${server.url}/api/dashboard`);

        assert.strictEqual(response.status, 200);

        const body = await response.json();

        assert.deepStrictEqual(body.alerts, []);
        assert.deepStrictEqual(body.projects, []);

    } finally {

        console.error = originalError;

        await server.close();

    }

});
