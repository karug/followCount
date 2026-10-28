const express = require("express");

const { SECRET_NAMES, ValidationError } = require("../services/SettingsService");
const { channelKey } = require("../services/DashboardService");

const MIN_PASSWORD_LENGTH = 8;

// Meta tokens validated before saving, with their label for warnings.
const META_SECRETS = {
    instagramAccessToken: "Instagram",
    facebookAccessToken: "Facebook"
};

// 12 characters or fewer would leak most of the secret if shown.
function mask(value) {

    if (value === null) {

        return { set: false, masked: null };

    }

    return {
        set: true,
        masked: value.length <= 12 ? "••••" : `${value.slice(0, 4)}…${value.slice(-4)}`
    };

}

function maskedSecrets(settings) {

    return Object.fromEntries(
        SECRET_NAMES.map(name => [name, mask(settings.secret(name))])
    );

}

// Express 4 does not catch rejected promises: never leave a request hanging.
function asyncRoute(handler) {

    return async (req, res) => {

        try {

            await handler(req, res);

        } catch (error) {

            console.error(error);

            if (!res.headersSent) {

                res.status(500).json({ error: "internal" });

            }

        }

    };

}

function createAdminRouter({
    settings,
    auth,
    dashboardService,
    metaTokens,
    kioskMonitor,
    alertService,
    systemStatus,
    systemActions
}) {

    const router = express.Router();

    // Blocks cross-site form posts: browsers can't send JSON
    // content types from a plain form.
    router.use((req, res, next) => {

        if (req.method !== "GET" && !req.is("application/json")) {

            return res.status(415).json({ error: "unsupported-media-type" });

        }

        next();

    });

    router.get("/session", (req, res) => {

        res.set("Cache-Control", "no-store");

        res.json({
            needsSetup: !settings.admin().passwordHash,
            authenticated: auth.isAuthenticated(req)
        });

    });

    router.post("/setup", (req, res) => {

        if (settings.admin().passwordHash) {

            return res.status(409).json({ error: "already-configured" });

        }

        const password = req.body?.password;

        if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {

            return res.status(400).json({ error: "password-too-short" });

        }

        // Hashing and saving are synchronous: no concurrent setup can
        // slip between the check above and the update.
        settings.update({
            admin: { passwordHash: auth.hashPassword(password) }
        });

        res.set("Set-Cookie", auth.setCookieHeader());

        res.json({ ok: true });

    });

    router.post("/login", asyncRoute(async (req, res) => {

        const stored = settings.admin().passwordHash;

        if (!stored || !await auth.verifyPasswordAsync(req.body?.password, stored)) {

            return res.status(401).json({ error: "auth" });

        }

        res.set("Set-Cookie", auth.setCookieHeader());

        res.json({ ok: true });

    }));

    router.post("/logout", (req, res) => {

        res.set("Set-Cookie", auth.clearCookieHeader());

        res.json({ ok: true });

    });

    /*
    |--------------------------------------------------------------------------
    | Protected routes
    |--------------------------------------------------------------------------
    */

    router.use(auth.requireSession);

    router.get("/settings", (req, res) => {

        res.set("Cache-Control", "no-store");

        res.json({
            config: settings.config(),
            secrets: maskedSecrets(settings)
        });

    });

    router.put("/config", asyncRoute(async (req, res) => {

        const config = req.body?.config;

        if (config === null || typeof config !== "object" || Array.isArray(config)) {

            return res.status(400).json({ errors: ["Falta el objeto config"] });

        }

        try {

            settings.update({ config });

        } catch (error) {

            if (error instanceof ValidationError) {

                return res.status(400).json({ errors: error.errors });

            }

            throw error;

        }

        res.json(settings.config());

    }));

    router.put("/secrets", asyncRoute(async (req, res) => {

        const incoming = req.body?.secrets;

        if (incoming === null || typeof incoming !== "object" || Array.isArray(incoming)) {

            return res.status(400).json({ error: "Falta el objeto secrets" });

        }

        const unknown = Object.keys(incoming).filter(name => !SECRET_NAMES.includes(name));

        if (unknown.length > 0) {

            return res.status(400).json({ error: `Secretos desconocidos: ${unknown.join(", ")}` });

        }

        // "" or absent = unchanged; only an explicit null deletes.
        const patch = {};

        const warnings = [];

        const values = {};

        for (const [name, raw] of Object.entries(incoming)) {

            if (raw !== undefined && raw !== null && typeof raw !== "string") {

                return res.status(400).json({ error: `El secreto ${name} debe ser texto` });

            }

            const value = typeof raw === "string" ? raw.trim() : raw;

            if (value === undefined || value === "") {

                continue;

            }

            values[name] = value;

        }

        // Credentials arriving in this same request win over saved ones.
        const creds = {
            appId: values.facebookAppId,
            appSecret: values.facebookAppSecret
        };

        for (const [name, value] of Object.entries(values)) {

            if (typeof value === "string" && Object.hasOwn(META_SECRETS, name)) {

                try {

                    const prepared = await metaTokens.prepareForSave(value, creds);

                    patch[name] = prepared.token;

                    if (prepared.warning) {

                        warnings.push(`${META_SECRETS[name]}: ${prepared.warning}`);

                    }

                } catch (error) {

                    return res.status(400).json({ error: error.message });

                }

                continue;

            }

            patch[name] = value;

        }

        settings.update({ secrets: patch });

        // Fire and forget: the response must not wait on Meta.
        Promise.resolve()
            .then(() => metaTokens.checkAll())
            .catch(error => console.error(error));

        res.json({ secrets: maskedSecrets(settings), warnings });

    }));

    router.get("/status", asyncRoute(async (req, res) => {

        const channels = [];

        for (const project of settings.config().projects ?? []) {

            for (const channel of project.channels ?? []) {

                const health = dashboardService.channelHealth.get(channelKey(channel));

                channels.push({
                    project: project.name,
                    type: channel.type,
                    id: channel.channelId ?? channel.pageId ?? channel.username ?? null,
                    lastSuccessAt: health?.lastSuccessAt ?? null,
                    failingSince: health?.failingSince ?? null,
                    lastError: health?.lastError ?? null
                });

            }

        }

        res.set("Cache-Control", "no-store");

        res.json({
            alerts: await alertService.codes(),
            kiosk: kioskMonitor.status(),
            metaTokens: metaTokens.status(),
            system: await systemStatus.read(),
            channels
        });

    }));

    router.post("/actions/:name", asyncRoute(async (req, res) => {

        const name = req.params.name;

        if (!systemActions.knows(name)) {

            return res.status(404).json({ error: "unknown-action" });

        }

        if (!systemActions.available()) {

            return res.status(501).json({ error: "No disponible en este equipo" });

        }

        if (name === "restart-backend") {

            // Also on close: a dropped connection must not cancel the restart.
            let scheduled = false;

            const schedule = () => {

                if (!scheduled) {

                    scheduled = true;

                    systemActions.scheduleExit();

                }

            };

            res.on("finish", schedule);

            res.on("close", schedule);

            return res.status(202).json({ ok: true });

        }

        try {

            await systemActions.execute(name);

        } catch (error) {

            console.error(error);

            return res.status(500).json({ error: "No se ha podido ejecutar la acción" });

        }

        res.json({ ok: true });

    }));

    return router;

}

module.exports = createAdminRouter;
