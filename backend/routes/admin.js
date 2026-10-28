const express = require("express");

const MIN_PASSWORD_LENGTH = 8;

function createAdminRouter({ settings, auth }) {

    const router = express.Router();

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

    router.post("/login", (req, res) => {

        const stored = settings.admin().passwordHash;

        if (!stored || !auth.verifyPassword(req.body?.password, stored)) {

            return res.status(401).json({ error: "auth" });

        }

        res.set("Set-Cookie", auth.setCookieHeader());

        res.json({ ok: true });

    });

    router.post("/logout", (req, res) => {

        res.set("Set-Cookie", auth.clearCookieHeader());

        res.json({ ok: true });

    });

    return router;

}

module.exports = createAdminRouter;
