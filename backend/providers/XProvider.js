const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class XProvider {

    constructor() {

        this.bearerToken = process.env.X_BEARER_TOKEN ?? null;

    }

    async fetch(channel) {

        if (!this.bearerToken) {

            throw new Error(
                "Missing X_BEARER_TOKEN in .env"
            );

        }

        const response = await Http.getJson(
            `https://api.x.com/2/users/by/username/${channel.username}`,
            {

                headers: {

                    Authorization: `Bearer ${this.bearerToken}`

                },

                params: {

                    "user.fields": "public_metrics,profile_image_url,description"

                }

            }
        );

        if (!response.data) {

            throw new Error(
                `X user '${channel.username}' not found`
            );

        }

        const user = response.data;

        // The default avatar URL points to a 48x48 thumbnail.
        const logo =
            user.profile_image_url
                ?.replace("_normal", "_400x400") ??
            null;

        return new Metric({

            type: "x",

            label: `@${user.username}`,

            value: user.public_metrics?.followers_count ?? 0,

            logo,

            metadata: {

                id: user.id,

                name: user.name,

                following: user.public_metrics?.following_count,

                tweets: user.public_metrics?.tweet_count,

                profile: `https://x.com/${user.username}`

            }

        });

    }

}

module.exports = XProvider;
