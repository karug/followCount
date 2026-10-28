const { WARN_BELOW_DAYS } = require("./MetaTokenService");

const { channelKey } = require("./DashboardService");

const DAY_MS = 24 * 3600 * 1000;

const CHANNEL_FAILING_MS = 24 * 3600 * 1000;

class AlertService {

    constructor({ metaTokens, dashboard, system, now = Date.now }) {

        this.metaTokens = metaTokens;

        this.dashboard = dashboard;

        this.system = system;

        this.now = now;

    }

    async codes() {

        const codes = [];

        const tokens = Object.values(this.metaTokens.status() ?? {});

        if (tokens.some(token => token.valid === false)) {

            codes.push("meta-token-invalid");

        }

        if (tokens.some(token => this.tokenExpiring(token))) {

            codes.push("meta-token-expiring");

        }

        if (this.channelFailing()) {

            codes.push("channel-failing");

        }

        const system = await this.system.read();

        if (system.undervoltageNow || system.undervoltageSinceBoot) {

            codes.push("undervoltage");

        }

        return codes;

    }

    tokenExpiring(token) {

        // A null expiresAt is "never expires" (valid) or "unknown",
        // never "expiring".
        return typeof token.expiresAt === "number" &&
            token.expiresAt - this.now() < WARN_BELOW_DAYS * DAY_MS;

    }

    channelFailing() {

        // channelHealth is never pruned, so only the channels in
        // the current config count: a deleted channel leaves no alert.
        const projects = this.dashboard.config?.projects ?? [];

        for (const project of projects) {

            for (const channel of project.channels ?? []) {

                const health = this.dashboard.channelHealth.get(
                    channelKey(channel)
                );

                if (
                    health?.failingSince != null &&
                    this.now() - health.failingSince > CHANNEL_FAILING_MS
                ) {

                    return true;

                }

            }

        }

        return false;

    }

}

module.exports = AlertService;
