const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class GithubProvider {

    async fetch(channel) {

        const user = await Http.getJson(
            `https://api.github.com/users/${channel.username}`
        );

        return new Metric({

            type: "github",

            label: channel.username,

            value: user.followers,

            logo: user.avatar_url,

            metadata: {

                publicRepos: user.public_repos,

                following: user.following,

                profile: user.html_url

            }

        });

    }

}

module.exports = GithubProvider;