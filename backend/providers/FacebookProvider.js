const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class FacebookProvider {

    constructor() {

        this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN ?? null;

    }

    async fetch(channel) {

        // Graph API accepts either the numeric page id or the
        // page username in the path.
        const pageId =
            channel.pageId ??
            channel.username;

        if (this.accessToken) {

            try {

                return await this.fetchFromGraph(pageId);

            } catch (error) {

                console.warn(
                    `Facebook Graph API failed for '${pageId}' ` +
                    `(${error.response?.data?.error?.message ?? error.message}), ` +
                    "falling back to public widget."
                );

            }

        }

        return this.fetchFromWidget(pageId);

    }

    async fetchFromGraph(pageId) {

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

            label: page.username ?? page.name ?? pageId,

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

    /**
     * Tokenless fallback: the public page embed widget exposes the
     * follower count in compact form ("154M followers"), so the
     * value is approximate.
     */
    async fetchFromWidget(pageId) {

        const response = await Http.get(
            "https://www.facebook.com/plugins/page.php",
            {

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/126.0.0.0 Safari/537.36",

                    "Accept-Language": "en-US,en;q=0.9"

                },

                params: {

                    href: `https://www.facebook.com/${pageId}`,

                    tabs: "",

                    small_header: true

                }

            }
        );

        const html = response.data;

        const followers = html.match(
            /([\d.,]+\s*[KMB]?)\s*followers/i
        );

        if (!followers) {

            throw new Error(
                `Facebook page '${pageId}' not found or widget blocked ` +
                "(set FACEBOOK_ACCESS_TOKEN for exact counts)"
            );

        }

        const logo = html.match(
            /<img[^>]+src="(https:\/\/scontent[^"]+)"/i
        );

        return new Metric({

            type: "facebook",

            label: pageId,

            value: this.parseCompact(followers[1]),

            logo:
                logo
                    ? logo[1].replace(/&amp;/g, "&")
                    : null,

            metadata: {

                approximate: true,

                profile: `https://www.facebook.com/${pageId}`

            }

        });

    }

    parseCompact(text) {

        const value = text.trim().toUpperCase();

        const suffixes = {

            K: 1000,

            M: 1000000,

            B: 1000000000

        };

        const suffix = value.slice(-1);

        if (suffixes[suffix]) {

            return Math.round(
                parseFloat(value) * suffixes[suffix]
            );

        }

        return Number(
            value.replace(/[.,\s]/g, "")
        );

    }

}

module.exports = FacebookProvider;
