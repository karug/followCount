const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class GithubProvider {

    constructor() {

        this.token = process.env.GITHUB_TOKEN ?? null;

    }

    headers() {

        if (!this.token) {

            return {};

        }

        return {

            Authorization: `Bearer ${this.token}`

        };

    }

    async fetch(channel) {

        const user = await Http.getJson(
            `https://api.github.com/users/${channel.username}`,
            {
                headers: this.headers()
            }
        );

        const stars =
            await this.fetchStars(channel.username);

        return new Metric({

            type: "github",

            label: channel.username,

            value: user.followers,

            logo: user.avatar_url,

            metadata: {

                stars,

                publicRepos: user.public_repos,

                following: user.following,

                profile: user.html_url

            }

        });

    }

    async fetchStars(username) {

        try {

            const repos = await Http.getJson(
                `https://api.github.com/users/${username}/repos`,
                {

                    headers: this.headers(),

                    params: {

                        per_page: 100,

                        type: "owner"

                    }

                }
            );

            return repos.reduce(
                (total, repo) =>
                    total + (repo.stargazers_count ?? 0),
                0
            );

        } catch (error) {

            console.warn(
                `Unable to fetch stars for '${username}': ${error.message}`
            );

            return null;

        }

    }

}

module.exports = GithubProvider;
