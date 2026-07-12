const { execFile } = require("child_process");
const { promisify } = require("util");
const https = require("https");

const Http = require("../utils/Http");
const Metric = require("../models/Metric");

const execFileAsync = promisify(execFile);

const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/126.0.0.0 Safari/537.36";

class InstagramProvider {

    constructor() {

        this.agents = {

            4: new https.Agent({ family: 4, keepAlive: true }),

            6: new https.Agent({ family: 6, keepAlive: true })

        };

        // Instagram rate-limits per address, so one family can be
        // blocked while the other stays clean — and which one
        // differs per machine. Remember the last family that
        // worked and try it first.
        this.preferredFamily = null;

        // Official Instagram Graph API (exact counts, no
        // scraping): needs a long-lived token with
        // pages_show_list + instagram_basic; accounts not linked
        // to an owned page additionally need
        // instagram_manage_insights (business discovery).
        this.accessToken =
            process.env.INSTAGRAM_ACCESS_TOKEN ?? null;

        this.ownAccounts = null;

        this.ownAccountsExpires = 0;

    }

    families() {

        if (this.preferredFamily === 6) {

            return [6, 4];

        }

        return [4, 6];

    }

    async fetch(channel) {

        if (this.accessToken) {

            try {

                return await this.fetchFromGraph(
                    channel.username
                );

            } catch (error) {

                console.warn(
                    `Instagram Graph API failed for ` +
                    `'${channel.username}' ` +
                    `(${error.response?.data?.error?.message ?? error.message}), ` +
                    "falling back to public endpoints."
                );

            }

        }

        const strategies = [];

        for (const family of this.families()) {

            strategies.push(

                () => this.fetchFromApi(
                    "https://i.instagram.com",
                    channel.username,
                    family
                ),

                // Node's TLS fingerprint gets 429'd on some
                // networks while curl's passes, so alternate
                // client per family too.
                () => this.fetchViaCurl(
                    channel.username,
                    family
                )

            );

        }

        strategies.push(

            () => this.fetchFromProfileHtml(
                channel.username
            )

        );

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

    async fetchFromGraph(username) {

        if (!/^[A-Za-z0-9._]+$/.test(username)) {

            throw new Error(
                `Invalid Instagram username '${username}'`
            );

        }

        const accounts =
            await this.getOwnAccounts();

        const ownId =
            accounts.get(username.toLowerCase());

        if (ownId) {

            const user = await Http.getJson(
                `https://graph.facebook.com/v21.0/${ownId}`,
                {

                    params: {

                        fields:
                            "username,name,followers_count," +
                            "profile_picture_url,media_count",

                        access_token: this.accessToken

                    }

                }
            );

            return this.toGraphMetric(user, username);

        }

        // Not one of our linked accounts: business discovery
        // through the first linked professional account.
        const gatewayId =
            accounts.values().next().value;

        if (!gatewayId) {

            throw new Error(
                "No linked Instagram professional account"
            );

        }

        const response = await Http.getJson(
            `https://graph.facebook.com/v21.0/${gatewayId}`,
            {

                params: {

                    fields:
                        `business_discovery.username(${username})` +
                        "{username,name,followers_count," +
                        "profile_picture_url,media_count}",

                    access_token: this.accessToken

                }

            }
        );

        if (!response.business_discovery) {

            throw new Error(
                `Business discovery returned nothing for '${username}'`
            );

        }

        return this.toGraphMetric(
            response.business_discovery,
            username
        );

    }

    async getOwnAccounts() {

        if (this.ownAccounts && Date.now() < this.ownAccountsExpires) {

            return this.ownAccounts;

        }

        const response = await Http.getJson(
            "https://graph.facebook.com/v21.0/me/accounts",
            {

                params: {

                    fields: "instagram_business_account{id,username}",

                    access_token: this.accessToken

                }

            }
        );

        const accounts = new Map();

        for (const page of response.data ?? []) {

            const account =
                page.instagram_business_account;

            if (account) {

                accounts.set(
                    account.username.toLowerCase(),
                    account.id
                );

            }

        }

        this.ownAccounts = accounts;

        this.ownAccountsExpires =
            Date.now() + (3600 * 1000);

        return accounts;

    }

    toGraphMetric(user, username) {

        return new Metric({

            type: "instagram",

            label: `@${user.username ?? username}`,

            value: user.followers_count ?? 0,

            logo: user.profile_picture_url ?? null,

            metadata: {

                id: user.id,

                name: user.name,

                posts: user.media_count,

                source: "graph",

                profile: `https://www.instagram.com/${username}/`

            }

        });

    }

    async fetchFromApi(host, username, family) {

        const response = await Http.getJson(
            `${host}/api/v1/users/web_profile_info/`,
            {

                httpsAgent: this.agents[family] ?? undefined,

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

        this.preferredFamily = family ?? this.preferredFamily;

        return this.toMetric(user, username);

    }

    toMetric(user, username) {

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

    async fetchViaCurl(username, family = 4) {

        const url =
            "https://i.instagram.com/api/v1/users/web_profile_info/" +
            `?username=${encodeURIComponent(username)}`;

        const { stdout } = await execFileAsync(
            "curl",
            [
                family === 6 ? "-6" : "-4",
                "-s",
                "-m", "15",
                "-H", "x-ig-app-id: 936619743392459",
                "-A", "Mozilla/5.0",
                url
            ],
            {
                maxBuffer: 5 * 1024 * 1024
            }
        );

        const user =
            JSON.parse(stdout)?.data?.user;

        if (!user) {

            throw new Error(
                `Instagram user '${username}' not found (curl)`
            );

        }

        this.preferredFamily = family;

        return this.toMetric(user, username);

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
            /content="([\d.,]+[KM]?) Followers?/i
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
