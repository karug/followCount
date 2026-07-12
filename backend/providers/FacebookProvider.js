const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class FacebookProvider {

    constructor() {

        this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN ?? null;

    }

    async fetch(channel) {

        if (!this.accessToken) {

            throw new Error(
                "Missing FACEBOOK_ACCESS_TOKEN in .env"
            );

        }

        // Graph API accepts either the numeric page id or the
        // page username in the path.
        const pageId =
            channel.pageId ??
            channel.username;

        const page = await Http.getJson(
            `https://graph.facebook.com/v21.0/${pageId}`,
            {

                params: {

                    fields: [
                        "name",
                        "username",
                        "followers_count",
                        "fan_count",
                        "link",
                        "picture.width(200){url}"
                    ].join(","),

                    access_token: this.accessToken

                }

            }
        );

        return new Metric({

            type: "facebook",

            label: page.username ?? page.name ?? channel.pageId,

            value:
                page.followers_count ??
                page.fan_count ??
                0,

            logo: page.picture?.data?.url ?? null,

            metadata: {

                id: page.id,

                name: page.name,

                likes: page.fan_count,

                profile:
                    page.link ??
                    `https://www.facebook.com/${pageId}`

            }

        });

    }

}

module.exports = FacebookProvider;
