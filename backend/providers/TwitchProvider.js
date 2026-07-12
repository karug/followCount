const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class TwitchProvider {

    constructor() {

        this.clientId = process.env.TWITCH_CLIENT_ID ?? null;

        this.clientSecret = process.env.TWITCH_CLIENT_SECRET ?? null;

        this.token = null;

        this.tokenExpires = 0;

    }

    async fetch(channel) {

        if (!this.clientId || !this.clientSecret) {

            throw new Error(
                "Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET in .env"
            );

        }

        const user =
            await this.fetchUser(channel.username);

        const followers =
            await this.fetchFollowers(user.id);

        return new Metric({

            type: "twitch",

            label: user.display_name ?? channel.username,

            value: followers,

            logo: user.profile_image_url ?? null,

            metadata: {

                id: user.id,

                description: user.description,

                profile: `https://www.twitch.tv/${user.login}`

            }

        });

    }

    async fetchUser(username) {

        const response = await Http.getJson(
            "https://api.twitch.tv/helix/users",
            {

                headers: await this.headers(),

                params: {

                    login: username

                }

            }
        );

        if (!response.data || response.data.length === 0) {

            throw new Error(
                `Twitch user '${username}' not found`
            );

        }

        return response.data[0];

    }

    async fetchFollowers(broadcasterId) {

        const response = await Http.getJson(
            "https://api.twitch.tv/helix/channels/followers",
            {

                headers: await this.headers(),

                params: {

                    broadcaster_id: broadcasterId,

                    first: 1

                }

            }
        );

        return response.total ?? 0;

    }

    async headers() {

        return {

            "Client-Id": this.clientId,

            Authorization: `Bearer ${await this.getToken()}`

        };

    }

    async getToken() {

        if (this.token && Date.now() < this.tokenExpires) {

            return this.token;

        }

        const response = await Http.post(
            "https://id.twitch.tv/oauth2/token",
            null,
            {

                params: {

                    client_id: this.clientId,

                    client_secret: this.clientSecret,

                    grant_type: "client_credentials"

                }

            }
        );

        this.token = response.access_token;

        // Renew one minute before actual expiry.
        this.tokenExpires =
            Date.now() +
            ((response.expires_in - 60) * 1000);

        return this.token;

    }

}

module.exports = TwitchProvider;
