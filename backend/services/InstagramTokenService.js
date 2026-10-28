const Http = require("../utils/Http");
const defaultSettings = require("./settings");

/**
 * Meta long-lived tokens last 60 days but can be refreshed
 * indefinitely (fb_exchange_token) as long as the underlying
 * session hasn't been explicitly invalidated (password change,
 * logout elsewhere). This keeps the token alive on its own so
 * nobody has to notice a 60-day countdown and regenerate it by
 * hand — only an explicit invalidation still requires that.
 */
class InstagramTokenService {

    constructor(settings = defaultSettings) {

        this.settings = settings;

        this.lastRefreshAt = null;

        this.lastError = null;

    }

    get appId() {

        return this.settings.secret("facebookAppId");

    }

    get appSecret() {

        return this.settings.secret("facebookAppSecret");

    }

    getToken() {

        return this.settings.secret("instagramAccessToken");

    }

    status() {

        return {

            hasToken: Boolean(this.getToken()),

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

        const token = this.getToken();

        if (!token) {

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

                        fb_exchange_token: token

                    }

                }
            );

            this.settings.update({
                secrets: { instagramAccessToken: response.access_token }
            });

            this.lastRefreshAt = new Date().toISOString();

            this.lastError = null;

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

}

module.exports = new InstagramTokenService();
