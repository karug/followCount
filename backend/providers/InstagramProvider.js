const Http = require("../utils/Http");
const Metric = require("../models/Metric");

const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/126.0.0.0 Safari/537.36";

class InstagramProvider {

    async fetch(channel) {

        // Instagram rate-limits per IP aggressively (429), so try
        // several public endpoints before giving up.
        const strategies = [

            () => this.fetchFromApi(
                "https://i.instagram.com",
                channel.username
            ),

            () => this.fetchFromApi(
                "https://www.instagram.com",
                channel.username
            ),

            () => this.fetchFromProfileHtml(
                channel.username
            )

        ];

        let lastError = null;

        for (const strategy of strategies) {

            try {

                return await strategy();

            } catch (error) {

                lastError = error;

            }

        }

        throw lastError;

    }

    async fetchFromApi(host, username) {

        const response = await Http.getJson(
            `${host}/api/v1/users/web_profile_info/`,
            {

                headers: {

                    // Public web app id used by instagram.com itself.
                    "x-ig-app-id": "936619743392459",

                    // A full Chrome UA over Node's TLS fingerprint
                    // trips Instagram's bot detection (429); the
                    // generic UA passes.
                    "User-Agent": "Mozilla/5.0"

                },

                params: {

                    username

                }

            }
        );

        const user = response?.data?.user;

        if (!user) {

            throw new Error(
                `Instagram user '${username}' not found`
            );

        }

        return new Metric({

            type: "instagram",

            label: `@${user.username ?? username}`,

            value: user.edge_followed_by?.count ?? 0,

            logo:
                user.profile_pic_url_hd ??
                user.profile_pic_url ??
                null,

            metadata: {

                id: user.id,

                name: user.full_name,

                following: user.edge_follow?.count,

                posts: user.edge_owner_to_timeline_media?.count,

                profile: `https://www.instagram.com/${username}/`

            }

        });

    }

    /**
     * Last resort: the public profile page embeds the follower
     * count both as JSON and in the og:description meta tag
     * ("123 Followers, 45 Following, 6 Posts").
     */
    async fetchFromProfileHtml(username) {

        const response = await Http.get(
            `https://www.instagram.com/${username}/`,
            {

                headers: {

                    "User-Agent": BROWSER_UA,

                    "Accept-Language": "en-US,en;q=0.9",

                    Accept: "text/html"

                }

            }
        );

        const html = response.data;

        const json = html.match(
            /"edge_followed_by":\{"count":(\d+)\}/
        );

        const description = html.match(
            /content="([\d.,]+[KM]?) Followers/i
        );

        if (!json && !description) {

            throw new Error(
                `Instagram user '${username}' not found or page blocked`
            );

        }

        const logo = html.match(
            /"profile_pic_url_hd":"([^"]+)"/
        );

        return new Metric({

            type: "instagram",

            label: `@${username}`,

            value:
                json
                    ? Number(json[1])
                    : this.parseCompact(description[1]),

            logo:
                logo
                    ? JSON.parse(`"${logo[1]}"`)
                    : null,

            metadata: {

                approximate: !json,

                profile: `https://www.instagram.com/${username}/`

            }

        });

    }

    parseCompact(text) {

        const value = text.trim().toUpperCase();

        const suffixes = {

            K: 1000,

            M: 1000000

        };

        const suffix = value.slice(-1);

        if (suffixes[suffix]) {

            return Math.round(
                parseFloat(value.replace(/,/g, "")) * suffixes[suffix]
            );

        }

        return Number(
            value.replace(/[.,]/g, "")
        );

    }

}

module.exports = InstagramProvider;
