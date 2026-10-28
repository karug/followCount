const test = require("node:test");
const assert = require("node:assert");

const AdminAuth = require("../services/AdminAuth");
const SystemActions = require("../services/SystemActions");
const { channelKey } = require("../services/DashboardService");
const { startServer, tempSettings } = require("../testing/server");

const FULL_SECRET = "EAAGabcdefghijklmnopX9Q2";

// Server with a configured password and a logged-in cookie.
async function startLoggedIn(overrides = {}) {

    const settings = overrides.settings ?? tempSettings().settings;

    const auth = new AdminAuth({ settings });

    settings.update({ admin: { passwordHash: auth.hashPassword("longenough") } });

    const server = await startServer({ ...overrides, settings });

    const login = await fetch(`${server.url}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "longenough" })
    });

    const cookie = login.headers.get("set-cookie").split(";")[0];

    const call = (method, path, body) => fetch(`${server.url}/api/admin${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    return { server, settings, call };

}

test("sin sesión todo /api/admin/* (salvo session/setup/login) da 401", async () => {

    const server = await startServer();

    try {

        const headers = { "Content-Type": "application/json" };

        const calls = [
            ["GET", "/settings"],
            ["PUT", "/config"],
            ["PUT", "/secrets"],
            ["GET", "/status"],
            ["POST", "/actions/reboot"]
        ];

        for (const [method, path] of calls) {

            const response = await fetch(`${server.url}/api/admin${path}`, {
                method,
                headers,
                body: method === "GET" ? undefined : "{}"
            });

            assert.strictEqual(response.status, 401, `${method} ${path}`);

        }

    } finally {

        await server.close();

    }

});

test("GET settings nunca devuelve un secreto completo", async () => {

    const { server, settings, call } = await startLoggedIn();

    try {

        settings.update({ secrets: { facebookAccessToken: FULL_SECRET, githubToken: "short" } });

        const response = await call("GET", "/settings");
        const text = await response.text();
        const body = JSON.parse(text);

        assert.ok(!text.includes(FULL_SECRET));
        assert.ok(!text.includes("short"));
        assert.deepStrictEqual(body.secrets.facebookAccessToken, { set: true, masked: "EAAG…X9Q2" });
        assert.deepStrictEqual(body.secrets.githubToken, { set: true, masked: "••••" });
        assert.deepStrictEqual(body.secrets.youtubeApiKey, { set: false, masked: null });
        assert.ok(Array.isArray(body.config.projects));

    } finally {

        await server.close();

    }

});

test("PUT secrets con \"\" no cambia y con null borra", async () => {

    const { server, settings, call } = await startLoggedIn();

    try {

        settings.update({ secrets: { githubToken: "ghp_original_value_123" } });

        const same = await call("PUT", "/secrets", { secrets: { githubToken: "", youtubeApiKey: undefined } });

        assert.strictEqual(same.status, 200);
        assert.strictEqual(settings.secret("githubToken"), "ghp_original_value_123");

        const cleared = await call("PUT", "/secrets", { secrets: { githubToken: null } });
        const body = await cleared.json();

        assert.strictEqual(cleared.status, 200);
        assert.strictEqual(settings.secret("githubToken"), null);
        assert.deepStrictEqual(body.secrets.githubToken, { set: false, masked: null });
        assert.deepStrictEqual(body.warnings, []);

    } finally {

        await server.close();

    }

});

test("PUT secrets rechaza claves desconocidas con 400", async () => {

    const { server, settings, call } = await startLoggedIn();

    try {

        const response = await call("PUT", "/secrets", { secrets: { nope: "x" } });

        assert.strictEqual(response.status, 400);
        assert.strictEqual(settings.secret("nope"), null);

    } finally {

        await server.close();

    }

});

test("PUT secrets guarda un token de Meta válido, avisa y relanza checkAll", async () => {

    let checked = 0;

    const metaTokens = {
        status: () => ({}),
        prepareForSave: async token => ({ token: token + "-long", status: {}, warning: "caduca pronto" }),
        checkAll: async () => { checked++; }
    };

    const { server, settings, call } = await startLoggedIn({ metaTokens });

    try {

        const response = await call("PUT", "/secrets", { secrets: { instagramAccessToken: "abc" } });
        const body = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(settings.secret("instagramAccessToken"), "abc-long");
        assert.deepStrictEqual(body.warnings, ["caduca pronto"]);
        assert.strictEqual(checked, 1);

    } finally {

        await server.close();

    }

});

test("PUT config inválida da 400 con errors y no cambia el fichero", async () => {

    const { server, settings, call } = await startLoggedIn();

    try {

        const before = JSON.stringify(settings.config());

        const response = await call("PUT", "/config", { config: { projects: "mal" } });
        const body = await response.json();

        assert.strictEqual(response.status, 400);
        assert.ok(body.errors.length > 0);
        assert.strictEqual(JSON.stringify(settings.config()), before);

        const ok = await call("PUT", "/config", { config: { slideSeconds: 12 } });

        assert.strictEqual(ok.status, 200);
        assert.strictEqual((await ok.json()).slideSeconds, 12);

    } finally {

        await server.close();

    }

});

test("PUT secrets de un token de Meta inválido da 400 y no guarda", async () => {

    const metaTokens = {
        status: () => ({}),
        prepareForSave: async () => { throw new Error("Token rechazado por Meta"); },
        checkAll: async () => {}
    };

    const { server, settings, call } = await startLoggedIn({ metaTokens });

    try {

        const response = await call("PUT", "/secrets", {
            secrets: {
                githubToken: "ghp_should_not_be_saved",
                facebookAccessToken: "bad-token"
            }
        });
        const body = await response.json();

        assert.strictEqual(response.status, 400);
        assert.match(body.error, /Token rechazado por Meta/);
        assert.strictEqual(settings.secret("facebookAccessToken"), null);
        assert.strictEqual(settings.secret("githubToken"), null);

    } finally {

        await server.close();

    }

});

test("GET status reúne alertas, kiosko, tokens, sistema y canales", async () => {

    const { settings } = tempSettings();

    const channel = { type: "youtube", channelId: "UC123" };

    settings.update({
        config: { projects: [{ name: "Demo", channels: [channel, { type: "github", username: "octo" }] }] }
    });

    const dashboardService = {
        config: settings.config(),
        channelHealth: new Map([[channelKey(channel), { lastSuccessAt: 5, failingSince: null, lastError: null }]]),
        build: async () => ({ projects: [] })
    };

    const { server, call } = await startLoggedIn({
        settings,
        dashboardService,
        alertService: { codes: async () => ["kiosk-offline"] },
        systemStatus: { read: async () => ({ cpu: 1 }) }
    });

    try {

        const body = await (await call("GET", "/status")).json();

        assert.deepStrictEqual(body.alerts, ["kiosk-offline"]);
        assert.deepStrictEqual(body.kiosk, { online: false });
        assert.deepStrictEqual(body.system, { cpu: 1 });
        assert.deepStrictEqual(body.channels, [
            { project: "Demo", type: "youtube", id: "UC123", lastSuccessAt: 5, failingSince: null, lastError: null },
            { project: "Demo", type: "github", id: "octo", lastSuccessAt: null, failingSince: null, lastError: null }
        ]);

    } finally {

        await server.close();

    }

});

test("un handler que falla responde 500 internal", async () => {

    const originalError = console.error;
    console.error = () => {};

    const { server, call } = await startLoggedIn({
        systemStatus: { read: async () => { throw new Error("boom"); } }
    });

    try {

        const response = await call("GET", "/status");

        assert.strictEqual(response.status, 500);
        assert.deepStrictEqual(await response.json(), { error: "internal" });

    } finally {

        console.error = originalError;

        await server.close();

    }

});

test("restart-backend responde 202 antes de llamar a exit", async () => {

    const events = [];

    const systemActions = new SystemActions({
        run: async () => {},
        exit: code => events.push(`exit:${code}`),
        platform: "linux"
    });

    const { server, call } = await startLoggedIn({ systemActions });

    try {

        const response = await call("POST", "/actions/restart-backend", {});

        events.push("response");

        assert.strictEqual(response.status, 202);
        assert.deepStrictEqual(events, ["response"]);

        await new Promise(resolve => setTimeout(resolve, 700));

        assert.deepStrictEqual(events, ["response", "exit:0"]);

    } finally {

        await server.close();

    }

});

test("restart-kiosk y reboot ejecutan el comando fijo", async () => {

    const calls = [];

    const systemActions = new SystemActions({
        run: async (command, args) => { calls.push([command, args]); },
        exit: () => {},
        platform: "linux"
    });

    const { server, call } = await startLoggedIn({ systemActions });

    try {

        assert.strictEqual((await call("POST", "/actions/restart-kiosk", {})).status, 200);
        assert.strictEqual((await call("POST", "/actions/reboot", {})).status, 200);

        assert.deepStrictEqual(calls, [
            ["sudo", ["-n", "systemctl", "restart", "followcount-kiosk"]],
            ["sudo", ["-n", "systemctl", "reboot"]]
        ]);

    } finally {

        await server.close();

    }

});

test("acciones en win32 dan 501", async () => {

    const calls = [];

    const systemActions = new SystemActions({
        run: async () => { calls.push(1); },
        exit: () => calls.push(2),
        platform: "win32"
    });

    const { server, call } = await startLoggedIn({ systemActions });

    try {

        for (const name of ["restart-kiosk", "restart-backend", "reboot"]) {

            const response = await call("POST", `/actions/${name}`, {});

            assert.strictEqual(response.status, 501, name);
            assert.deepStrictEqual(await response.json(), { error: "No disponible en este equipo" });

        }

        assert.deepStrictEqual(calls, []);

    } finally {

        await server.close();

    }

});

test("acción desconocida da 404", async () => {

    const systemActions = new SystemActions({ run: async () => {}, exit: () => {}, platform: "linux" });

    const { server, call } = await startLoggedIn({ systemActions });

    try {

        assert.strictEqual((await call("POST", "/actions/format-disk", {})).status, 404);

    } finally {

        await server.close();

    }

});
