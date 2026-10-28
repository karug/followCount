const fs = require("fs");
const os = require("os");
const path = require("path");

const { SettingsService } = require("../services/SettingsService");
const createApp = require("../app");

// Settings over a temp dir, so tests never touch backend/state.
function tempSettings() {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-settings-"));

    const legacyConfigFile = path.join(dir, "config.json");

    fs.writeFileSync(legacyConfigFile, JSON.stringify({ projects: [] }));

    const settings = new SettingsService({
        file: path.join(dir, "settings.json"),
        legacyConfigFile,
        legacyTokenFile: path.join(dir, "no-token.json"),
        env: {}
    });

    settings.load();

    return { settings, dir };

}

// Starts createApp on port 0; overrides replace the default doubles.
async function startServer(overrides = {}) {

    const temp = overrides.settings ? null : tempSettings();

    const deps = {
        settings: temp?.settings,
        dashboardService: { build: async () => ({ projects: [] }) },
        metaTokens: { status: () => ({}) },
        kioskMonitor: { status: () => ({ online: false }), record: () => {} },
        alertService: { codes: async () => [] },
        systemStatus: { read: async () => ({}) },
        ...overrides
    };

    const server = await new Promise(resolve => {
        const instance = createApp(deps).listen(0, "127.0.0.1", () => resolve(instance));
    });

    return {
        url: `http://127.0.0.1:${server.address().port}`,
        settings: deps.settings,
        close: () => new Promise(resolve => {
            server.close(() => {
                if (temp) {
                    fs.rmSync(temp.dir, { recursive: true, force: true });
                }
                resolve();
            });
        })
    };

}

module.exports = { startServer, tempSettings };
