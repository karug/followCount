const Http = require("../utils/Http");
const defaultSettings = require("./settings");

const GRAPH = "https://graph.facebook.com/v21.0";

const DAY_MS = 24 * 3600 * 1000;

const EXCHANGE_BELOW_DAYS = 7;

const WARN_BELOW_DAYS = 14;

const NETWORK_WARNING = "No se ha podido validar con Meta";

/**
 * Checks the real expiry of the Meta tokens with debug_token and
 * extends short-lived ones (fb_exchange_token) before they are saved.
 * `valid: null` means unknown; only `false` counts as invalid.
 */
class MetaTokenService {

    constructor({ settings = defaultSettings, http = Http, now = () => Date.now() } = {}) {

        this.settings = settings;

        this.http = http;

        this.now = now;

    }

    get appId() {

        return this.settings.secret("facebookAppId");

    }

    get appSecret() {

        return this.settings.secret("facebookAppSecret");

    }

    async inspect(token) {

        if (!this.appId || !this.appSecret) {

            return {
                valid: null,
                expiresAt: null,
                error: "Sin App ID/secret: no se puede comprobar"
            };

        }

        try {

            const response = await this.http.getJson(`${GRAPH}/debug_token`, {

                params: {

                    input_token: token,

                    access_token: `${this.appId}|${this.appSecret}`

                }

            });

            const data = response?.data ?? {};

            if (!data.is_valid) {

                return {
                    valid: false,
                    expiresAt: null,
                    error: data.error?.message ?? "Token no válido"
                };

            }

            return {
                valid: true,
                expiresAt: data.expires_at ? data.expires_at * 1000 : null,
                error: null
            };

        } catch (error) {

            return {
                valid: null,
                expiresAt: null,
                error: error.response?.data?.error?.message ?? NETWORK_WARNING
            };

        }

    }

    async prepareForSave(token) {

        const status = await this.inspect(token);

        if (status.valid === false) {

            throw new Error(status.error);

        }

        if (status.valid === null) {

            return { token, status, warning: status.error };

        }

        if (!this.expiresSoon(status, EXCHANGE_BELOW_DAYS)) {

            return { token, status, warning: null };

        }

        let result = null;

        try {

            const response = await this.http.getJson(`${GRAPH}/oauth/access_token`, {

                params: {

                    grant_type: "fb_exchange_token",

                    client_id: this.appId,

                    client_secret: this.appSecret,

                    fb_exchange_token: token

                }

            });

            result = response?.access_token ?? null;

        } catch (error) {

            result = null;

        }

        if (!result) {

            return { token, status, warning: NETWORK_WARNING };

        }

        const renewed = await this.inspect(result);

        if (renewed.valid === false) {

            return {
                token,
                status,
                warning: `El token alargado no es válido (${renewed.error}); se conserva el original`
            };

        }

        if (renewed.valid === null) {

            return {
                token: result,
                status,
                warning: `No se ha podido validar el token alargado (${renewed.error})`
            };

        }

        const warning = this.expiresSoon(renewed, EXCHANGE_BELOW_DAYS)
            ? "El token caduca en menos de 7 días y no se ha podido alargar"
            : null;

        return { token: result, status: renewed, warning };

    }

    async checkAll() {

        const checkedAt = this.now();

        const metaTokens = {};

        const previous = this.status();

        const targets = [
            ["instagram", this.settings.secret("instagramAccessToken")],
            ["facebook", this.settings.secret("facebookAccessToken")]
        ];

        for (const [name, token] of targets) {

            if (!token) {

                continue;

            }

            const status = await this.inspect(token);

            if (status.valid === null) {

                // Inconclusive: keep the last known expiry
                status.expiresAt = previous[name]?.expiresAt ?? null;

                console.warn(`Meta ${name} token could not be checked: ${status.error}`);

            } else if (status.valid === false || this.expiresSoon(status, WARN_BELOW_DAYS)) {

                console.warn(
                    `Meta ${name} token needs attention: ` +
                    (status.error ?? `expires at ${new Date(status.expiresAt).toISOString()}`)
                );

            }

            metaTokens[name] = { ...status, checkedAt };

        }

        this.settings.update({ meta: { metaTokens } });

    }

    start(intervalHours = 24) {

        const run = () => this.checkAll().catch(
            (error) => console.warn(`Meta token check failed: ${error.message}`)
        );

        run();

        setInterval(run, intervalHours * 3600 * 1000).unref();

    }

    status() {

        return this.settings.meta().metaTokens ?? {};

    }

    expiresSoon(status, days) {

        if (status.expiresAt === null) {

            // null means "never expires" only for a valid token
            return status.valid !== true;

        }

        return status.expiresAt - this.now() < days * DAY_MS;

    }

}

module.exports = MetaTokenService;
module.exports.MetaTokenService = MetaTokenService;
module.exports.EXCHANGE_BELOW_DAYS = EXCHANGE_BELOW_DAYS;
module.exports.WARN_BELOW_DAYS = WARN_BELOW_DAYS;
