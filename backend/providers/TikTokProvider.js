const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class TikTokProvider {

    async fetch(channel) {

        const response = await Http.get(
            `https://www.tiktok.com/@${channel.username}`,
            {

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/126.0.0.0 Safari/537.36",

                    Accept: "text/html"

                }

            }
        );

        const userInfo =
            this.extractUserInfo(response.data);

        if (!userInfo) {

            throw new Error(
                `TikTok user '${channel.username}' not found`
            );

        }

        const user = userInfo.user ?? {};

        const stats = userInfo.stats ?? {};

        return new Metric({

            type: "tiktok",

            label: `@${user.uniqueId ?? channel.username}`,

            value: stats.followerCount ?? 0,

            logo:
                user.avatarLarger ??
                user.avatarMedium ??
                null,

            metadata: {

                id: user.id,

                name: user.nickname,

                likes: stats.heartCount,

                videos: stats.videoCount,

                profile: `https://www.tiktok.com/@${channel.username}`

            }

        });

    }

    extractUserInfo(html) {

        // TikTok embeds its state as JSON inside this script tag.
        const match = html.match(
            /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s
        );

        if (!match) {

            return null;

        }

        try {

            const state = JSON.parse(match[1]);

            return state["__DEFAULT_SCOPE__"]
                ?.["webapp.user-detail"]
                ?.userInfo ?? null;

        } catch (error) {

            return null;

        }

    }

}

module.exports = TikTokProvider;
