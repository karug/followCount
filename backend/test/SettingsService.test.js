const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    SettingsService,
    SECRET_NAMES,
    ValidationError,
    validateConfig
} = require("../services/SettingsService");

function tempDir() {

    return fs.mkdtempSync(path.join(os.tmpdir(), "settings-"));

}

function makeService(dir, { env = {}, legacyConfig = null, legacyToken = null } = {}) {

    const file = path.join(dir, "state", "settings.json");
    const legacyConfigFile = path.join(dir, "config.json");
    const legacyTokenFile = path.join(dir, "instagram-token.json");

    if (legacyConfig) {
        fs.writeFileSync(legacyConfigFile, JSON.stringify(legacyConfig));
    }

    if (legacyToken) {
        fs.writeFileSync(legacyTokenFile, JSON.stringify(legacyToken));
    }

    return {
        file,
        service: new SettingsService({ file, legacyConfigFile, legacyTokenFile, env })
    };

}

const threeProjects = {
    refreshSeconds: 60,
    slideSeconds: 15,
    projects: [
        { name: "A", channels: [{ type: "youtube", channelId: "UC1" }] },
        { name: "B", channels: [{ type: "github", username: "b" }] },
        { name: "C", channels: [{ type: "tiktok", username: "c" }] }
    ]
};

test("migra config.json, env y el token guardado", () => {

    const dir = tempDir();

    const { service, file } = makeService(dir, {
        legacyConfig: threeProjects,
        legacyToken: { token: "stored", refreshedAt: "2026-01-01" },
        env: { YOUTUBE_API_KEY: "yt", INSTAGRAM_ACCESS_TOKEN: "envtok", GITHUB_TOKEN: "" }
    });

    service.load();

    assert.strictEqual(service.config().projects.length, 3);
    assert.strictEqual(service.secret("youtubeApiKey"), "yt");
    assert.strictEqual(service.secret("instagramAccessToken"), "stored");
    assert.strictEqual(service.secret("githubToken"), null);
    assert.ok(fs.existsSync(file));
    assert.match(service.admin().sessionSecret, /^[0-9a-f]{64}$/);
    assert.strictEqual(service.admin().passwordHash, null);

});

test("no pisa un settings.json corrupto", () => {

    const dir = tempDir();

    const { service, file } = makeService(dir, { legacyConfig: threeProjects });

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{oops");

    assert.throws(() => service.load(), /invalid/);
    assert.strictEqual(fs.readFileSync(file, "utf8"), "{oops");

});

test("update rechaza config inválida sin escribir", () => {

    const dir = tempDir();

    const { service, file } = makeService(dir, { legacyConfig: threeProjects });

    service.load();

    const before = fs.readFileSync(file, "utf8");
    const mtime = fs.statSync(file).mtimeMs;

    const bad = {
        ...threeProjects,
        projects: [{ name: "X", channels: [{ type: "youtube" }] }]
    };

    assert.throws(
        () => service.update({ config: bad }),
        error => error instanceof ValidationError && error.errors[0].includes("channelId")
    );

    assert.strictEqual(fs.readFileSync(file, "utf8"), before);
    assert.strictEqual(fs.statSync(file).mtimeMs, mtime);
    assert.strictEqual(service.config().projects.length, 3);

});

test("secrets: undefined conserva y null borra", () => {

    const dir = tempDir();

    const { service } = makeService(dir, {
        legacyConfig: threeProjects,
        env: { GITHUB_TOKEN: "gh", X_BEARER_TOKEN: "x" }
    });

    service.load();

    service.update({ secrets: { githubToken: undefined, xBearerToken: null } });

    assert.strictEqual(service.secret("githubToken"), "gh");
    assert.strictEqual(service.secret("xBearerToken"), null);

});

test("emite change con los bloques", () => {

    const dir = tempDir();

    const { service } = makeService(dir, { legacyConfig: threeProjects });

    service.load();

    const events = [];

    service.on("change", blocks => events.push(blocks));

    service.update({ config: { ...threeProjects, slideSeconds: 20 } });

    assert.deepStrictEqual(events, [["config"]]);
    assert.strictEqual(service.config().slideSeconds, 20);

});

test("no deja temporales", () => {

    const dir = tempDir();

    const { service, file } = makeService(dir, { legacyConfig: threeProjects });

    service.load();

    service.update({ meta: { instagram: { ok: true } } });

    assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["settings.json"]);

});

test("recarga el fichero existente y conserva el sessionSecret", () => {

    const dir = tempDir();

    const first = makeService(dir, { legacyConfig: threeProjects });

    first.service.load();

    const second = makeService(dir);

    second.service.load();

    assert.strictEqual(second.service.admin().sessionSecret, first.service.admin().sessionSecret);
    assert.strictEqual(second.service.config().projects.length, 3);

});

test("genera sessionSecret si el fichero no lo trae", () => {

    const dir = tempDir();

    const { service, file } = makeService(dir);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ config: threeProjects, secrets: {}, admin: {}, meta: {} }));

    service.load();

    assert.match(service.admin().sessionSecret, /^[0-9a-f]{64}$/);
    assert.strictEqual(JSON.parse(fs.readFileSync(file, "utf8")).admin.sessionSecret, service.admin().sessionSecret);

});

test("exporta los nombres de secretos", () => {

    assert.strictEqual(SECRET_NAMES.length, 9);
    assert.ok(SECRET_NAMES.includes("facebookAppSecret"));

});

test("validateConfig aplica las reglas por tipo y rangos", () => {

    assert.deepStrictEqual(validateConfig(threeProjects), []);

    const errors = validateConfig({
        refreshSeconds: 0,
        transition: "zoom",
        projects: [
            {
                name: "",
                primaryChannel: "x",
                channels: [
                    { type: "facebook" },
                    { type: "github" },
                    { type: "myspace", username: "u" },
                    { type: "tiktok", username: "u", cacheSeconds: 1.5 }
                ]
            },
            { name: "Sin canales" }
        ]
    });

    assert.ok(errors.some(e => e.includes("refreshSeconds")));
    assert.ok(errors.some(e => e.includes("transition")));
    assert.ok(errors.some(e => e.includes("nombre")));
    assert.ok(errors.some(e => e.includes("pageId")));
    assert.ok(errors.some(e => e.includes("username")));
    assert.ok(errors.some(e => e.includes("myspace")));
    assert.ok(errors.some(e => e.includes("cacheSeconds")));
    assert.ok(errors.some(e => e.includes("primaryChannel")));
    assert.ok(errors.some(e => e.includes("channels")));

    assert.deepStrictEqual(
        validateConfig({ projects: [{ name: "F", channels: [{ type: "facebook", pageId: "1" }] }] }),
        []
    );

    assert.ok(validateConfig({ projects: "no" }).length > 0);

});
