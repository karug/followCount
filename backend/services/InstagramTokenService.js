const fs = require("fs");
const path = require("path");

const Http = require("../utils/Http");

/**
 * Meta long-lived tokens last 60 days but can be refreshed
 * indefinitely (fb_exchange_token) as long as the underlying
 * session hasn't been explicitly invalidated (password change,
 * logout elsewhere). This keeps the token alive on its own so
 * nobody has to notice a 60-day countdown and regenerate it by
 * hand — only an explicit invalidation still requires that.
 */
class InstagramTokenService {

    constructor() {

        this.tokenFile = path.join(
            __dirname,
            "..",
            "cache",
            "instagram-token.json"
        );

        this.appId = process.env.FACEBOOK_APP_ID ?? null;

        this.appSecret = process.env.FACEBOOK_APP_SECRET ?? null;

        this.token = null;

        this.lastRefreshAt = null;

        this.lastError = null;

    }

    load() {

        try {

            const stored = JSON.parse(
                fs.readFileSync(this.tokenFile, "utf8")
            );

            this.token = stored.token;

            this.lastRefreshAt = stored.refreshedAt ?? null;

        } catch (error) {

            this.token =
                process.env.INSTAGRAM_ACCESS_TOKEN ?? null;

        }

    }

    getToken() {

        return this.token;

    }

    status() {

        return {

            hasToken: Boolean(this.token),

            autoRefreshConfigured:
                Boolean(this.appId && this.appSecret),

            lastRefreshAt: this.lastRefreshAt,

            lastError: this.lastError

        };

    }

    /**
     * Runs once immediately (so a stale token is retried right
     * after a deploy/restart) and then on a fixed cadence.
     */
    start(intervalHours = 48) {

        this.refresh();

        setInterval(
            () => this.refresh(),
            intervalHours * 3600 * 1000
        );

    }

    async refresh() {

        if (!this.token) {

            return false;

        }

        if (!this.appId || !this.appSecret) {

            // Nothing to exchange with: the initial token still
            // works until it dies, it just won't renew itself.
            return false;

        }

        try {

            const response = await Http.getJson(
                "https://graph.facebook.com/v21.0/oauth/access_token",
                {

                    params: {

                        grant_type: "fb_exchange_token",

                        client_id: this.appId,

                        client_secret: this.appSecret,

                        fb_exchange_token: this.token

                    }

                }
            );

            this.token = response.access_token;

            this.lastRefreshAt = new Date().toISOString();

            this.lastError = null;

            this.persist();

            console.log(
                "Instagram/Facebook token refreshed, expires in " +
                `${response.expires_in ?? "?"}s.`
            );

            return true;

        } catch (error) {

            this.lastError =
                error.response?.data?.error?.message ??
                error.message;

            console.warn(
                `Token refresh failed (${this.lastError}). ` +
                "If the session was invalidated (password change, " +
                "logout elsewhere), a new token must be generated " +
                "by hand — see README."
            );

            return false;

        }

    }

    persist() {

        fs.mkdirSync(
            path.dirname(this.tokenFile),
            { recursive: true }
        );

        fs.writeFileSync(
            this.tokenFile,
            JSON.stringify({

                token: this.token,

                refreshedAt: this.lastRefreshAt

            })
        );

    }

}

module.exports = new InstagramTokenService();
