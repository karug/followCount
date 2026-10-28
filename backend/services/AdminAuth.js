const crypto = require("crypto");

const COOKIE_NAME = "fc_admin";

const SESSION_TTL_MS = 12 * 3600 * 1000;

const SALT_BYTES = 16;

const KEY_BYTES = 64;

class AdminAuth {

    constructor({ settings, now = Date.now }) {

        this.settings = settings;

        this.now = now;

        // Middleware handed to routers, so it must keep its binding.
        this.requireSession = this.requireSession.bind(this);

    }

    hashPassword(password) {

        const salt = crypto.randomBytes(SALT_BYTES);

        const hash = crypto.scryptSync(password, salt, KEY_BYTES);

        return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;

    }

    verifyPassword(password, stored) {

        if (typeof password !== "string" || typeof stored !== "string") {

            return false;

        }

        const [scheme, saltHex, hashHex] = stored.split("$");

        if (scheme !== "scrypt" || !saltHex || !hashHex) {

            return false;

        }

        const expected = Buffer.from(hashHex, "hex");

        const actual = crypto.scryptSync(
            password,
            Buffer.from(saltHex, "hex"),
            expected.length
        );

        return actual.length === expected.length &&
            crypto.timingSafeEqual(actual, expected);

    }

    sign(exp) {

        return crypto
            .createHmac("sha256", this.settings.admin().sessionSecret)
            .update(String(exp))
            .digest("hex");

    }

    // Cookie value: "<expiry ms>.<hmac of expiry>".
    issueCookie() {

        const exp = this.now() + SESSION_TTL_MS;

        return `${exp}.${this.sign(exp)}`;

    }

    isValid(value) {

        if (typeof value !== "string") {

            return false;

        }

        const [exp, signature, extra] = value.split(".");

        if (!/^\d+$/.test(exp ?? "") || !signature || extra !== undefined) {

            return false;

        }

        const expected = Buffer.from(this.sign(exp), "hex");

        const actual = Buffer.from(signature, "hex");

        if (
            actual.length !== expected.length ||
            !crypto.timingSafeEqual(actual, expected)
        ) {

            return false;

        }

        return Number(exp) > this.now();

    }

    readCookie(req) {

        const header = req.headers?.cookie;

        if (!header) {

            return null;

        }

        for (const part of header.split(";")) {

            const index = part.indexOf("=");

            if (part.slice(0, index).trim() === COOKIE_NAME) {

                return part.slice(index + 1).trim();

            }

        }

        return null;

    }

    isAuthenticated(req) {

        return this.isValid(this.readCookie(req));

    }

    setCookieHeader() {

        return `${COOKIE_NAME}=${this.issueCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;

    }

    clearCookieHeader() {

        return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

    }

    requireSession(req, res, next) {

        if (!this.isAuthenticated(req)) {

            return res.status(401).json({ error: "auth" });

        }

        next();

    }

}

module.exports = AdminAuth;
