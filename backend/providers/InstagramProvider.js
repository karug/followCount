const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class InstagramProvider {

    async fetch(channel) {

        const response = await Http.getJson(
            "https://i.instagram.com/api/v1/users/web_profile_info/",
            {

                headers: {

                    // Public web app id used by instagram.com itself.
                    "x-ig-app-id": "936619743392459",

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/126.0.0.0 Safari/537.36"

                },

                params: {

                    username: channel.username

                }

            }
        );

        const user = response?.data?.user;

        if (!user) {

            throw new Error(
                `Instagram user '${channel.username}' not found`
            );

        }

        return new Metric({

            type: "instagram",

            label: `@${user.username ?? channel.username}`,

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

                profile: `https://www.instagram.com/${channel.username}/`

            }

        });

    }

}

module.exports = InstagramProvider;
