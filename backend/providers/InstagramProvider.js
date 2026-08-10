const { execFile } = require("child_process");
const { promisify } = require("util");
const https = require("https");

const Http = require("../utils/Http");
const Metric = require("../models/Metric");
const TokenService = require("../services/InstagramTokenService");

const execFileAsync = promisify(execFile);

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

        this.ownAccounts = null;

        this.ownAccountsExpires = 0;

        // /me/accounts enumeration needs business_management,
        // which not every token grant includes; a direct fetch by
        // page id works with just pages_read_engagement. Once any
        // linked account resolves this way, its IG id becomes the
        // gateway for business discovery of unlinked usernames.
        this.gatewayIgId = null;

    }

    // Read live from the shared service instead of caching at
    // construction, so a background token refresh applies
    // immediately without restarting the process.
    get accessToken() {

        return TokenService.getToken();

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
                    channel.username,
                    channel.facebookPageId
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

    async fetchFromGraph(username, pageId) {

        if (!/^[A-Za-z0-9._]+$/.test(username)) {

            throw new Error(
                `Invalid Instagram username '${username}'`
            );

        }

        if (pageId) {

            const account =
                await this.fetchOwnByPageId(pageId, username);

            if (account) {

                return account;

            }

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

            this.gatewayIgId = ownId;

            return this.toGraphMetric(user, username);

        }

        // Not one of our linked accounts: business discovery
        // through a linked professional account.
        const gatewayId =
            this.gatewayIgId ??
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

    /**
     * Resolves the Instagram account linked to a known Facebook
     * page id directly — works with just pages_read_engagement,
     * unlike /me/accounts which needs business_management. Returns
     * null (not a throw) when the page doesn't link the requested
     * username, so the caller can fall through to the other paths.
     */
    async fetchOwnByPageId(pageId, username) {

        const page = await Http.getJson(
            `https://graph.facebook.com/v21.0/${pageId}`,
            {

                params: {

                    fields:
                        "instagram_business_account{id,username," +
                        "name,followers_count,profile_picture_url," +
                        "media_count}",

                    access_token: this.accessToken

                }

            }
        );

        const account = page.instagram_business_account;

        if (!account) {

            return null;

        }

        this.gatewayIgId = account.id;

        if (account.username?.toLowerCase() !== username.toLowerCase()) {

            return null;

        }

        return this.toGraphMetric(account, username);

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

                    // A full Chrome UA over Node's TLS fingerprint
                    // makes Instagram serve the full client app
                    // shell (no SSR meta tags); the generic UA
                    // gets the crawler-friendly page with them.
                    "User-Agent": "Mozilla/5.0",

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

        // profile_pic_url_hd only appears in the full JSON payload
        // (alongside edge_followed_by); the crawler-friendly page
        // only has the smaller og:image, HTML-entity escaped.
        const jsonLogo = html.match(
            /"profile_pic_url_hd":"([^"]+)"/
        );

        const ogLogo = html.match(
            /<meta property="og:image" content="([^"]+)"/
        );

        const logo =
            jsonLogo
                ? JSON.parse(`"${jsonLogo[1]}"`)
                : ogLogo?.[1]?.replace(/&amp;/g, "&") ?? null;

        return new Metric({

            type: "instagram",

            label: `@${username}`,

            value:
                json
                    ? Number(json[1])
                    : this.parseCompact(description[1]),

            logo,

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
