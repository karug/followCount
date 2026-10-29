const test = require("node:test");
const assert = require("node:assert");

const InstagramProvider = require("../providers/InstagramProvider");
const FacebookProvider = require("../providers/FacebookProvider");
const TikTokProvider = require("../providers/TikTokProvider");
const ProviderFactory = require("../services/ProviderFactory");
const YoutubeProvider = require("../providers/YoutubeProvider");
const { SettingsService } = require("../services/SettingsService");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function makeSettings(secrets = {}) {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "providers-settings-"));

    const legacyConfigFile = path.join(dir, "config.json");

    fs.writeFileSync(legacyConfigFile, JSON.stringify({ projects: [] }));

    const settings = new SettingsService({
        file: path.join(dir, "settings.json"),
        legacyConfigFile,
        legacyTokenFile: path.join(dir, "none.json"),
        env: {}
    });

    settings.load();

    settings.update({ secrets });

    return settings;

}

test("parseCompact handles suffixes and separators", () => {

    const instagram = new InstagramProvider();

    assert.strictEqual(instagram.parseCompact("154M"), 154000000);

    assert.strictEqual(instagram.parseCompact("1.2K"), 1200);

    assert.strictEqual(instagram.parseCompact("12,345"), 12345);

    assert.strictEqual(instagram.parseCompact("1"), 1);

    const facebook = new FacebookProvider();

    assert.strictEqual(facebook.parseCompact("2.5B"), 2500000000);

    assert.strictEqual(facebook.parseCompact("0"), 0);

});

test("instagram toMetric maps the public profile payload", () => {

    const provider = new InstagramProvider();

    const metric = provider.toMetric(
        {
            username: "expirioapp",
            full_name: "Expirio App",
            id: "42",
            edge_followed_by: { count: 7 },
            edge_follow: { count: 3 },
            edge_owner_to_timeline_media: { count: 1 },
            profile_pic_url_hd: "https://example.com/pic.jpg"
        },
        "expirioapp"
    );

    assert.strictEqual(metric.type, "instagram");

    assert.strictEqual(metric.label, "@expirioapp");

    assert.strictEqual(metric.value, 7);

    assert.strictEqual(metric.logo, "https://example.com/pic.jpg");

    assert.strictEqual(metric.metadata.following, 3);

});

test("instagram toGraphMetric maps the Graph API payload", () => {

    const provider = new InstagramProvider();

    const metric = provider.toGraphMetric(
        {
            id: "17841400000000000",
            username: "expirioapp",
            name: "Expirio App",
            followers_count: 4,
            profile_picture_url: "https://example.com/pic.jpg",
            media_count: 2
        },
        "expirioapp"
    );

    assert.strictEqual(metric.value, 4);

    assert.strictEqual(metric.label, "@expirioapp");

    assert.strictEqual(metric.metadata.source, "graph");

});

test("instagram graph rejects malformed usernames", async () => {

    const provider = new InstagramProvider();

    await assert.rejects(
        () => provider.fetchFromGraph("evil){id}"),
        /Invalid Instagram username/
    );

});

test("extractFollowersFromHtml reads the edge_followed_by JSON when present", () => {

    const provider = new InstagramProvider();

    const html = '<script>"edge_followed_by":{"count":42}</script>' +
        '<meta content="9 Followers, 3 Following" />';

    assert.deepStrictEqual(
        provider.extractFollowersFromHtml(html),
        { value: 42, approximate: false }
    );

});

test("extractFollowersFromHtml falls back to the compact og:description count", () => {

    const provider = new InstagramProvider();

    const html =
        '<meta content="1.2K Followers, 45 Following, 6 Posts" />';

    assert.deepStrictEqual(
        provider.extractFollowersFromHtml(html),
        { value: 1200, approximate: true }
    );

});

test("extractFollowersFromHtml throws when neither pattern is present", () => {

    const provider = new InstagramProvider();

    assert.throws(
        () => provider.extractFollowersFromHtml("<html>login wall</html>"),
        /didn't contain follower data/
    );

});

test("extractLogoFromHtml prefers profile_pic_url_hd over og:image", () => {

    const provider = new InstagramProvider();

    const html =
        '"profile_pic_url_hd":"https:\\/\\/example.com\\/hd.jpg"' +
        '<meta property="og:image" content="https://example.com/og.jpg" />';

    assert.strictEqual(
        provider.extractLogoFromHtml(html),
        "https://example.com/hd.jpg"
    );

});

test("extractLogoFromHtml falls back to og:image, tolerant of attribute order", () => {

    const provider = new InstagramProvider();

    // Real Instagram markup has other attributes and no fixed
    // spacing between property= and content=, unlike a minimal
    // hand-written fixture.
    const html =
        '<meta data-x="1"\n  property="og:image"   ' +
        'content="https://example.com/og.jpg?a=1&amp;b=2" data-y="2"/>';

    assert.strictEqual(
        provider.extractLogoFromHtml(html),
        "https://example.com/og.jpg?a=1&b=2"
    );

});

test("extractLogoFromHtml returns null when neither source is present", () => {

    const provider = new InstagramProvider();

    assert.strictEqual(
        provider.extractLogoFromHtml("<html></html>"),
        null
    );

});

test("tiktok extractUserInfo parses the rehydration JSON", () => {

    const provider = new TikTokProvider();

    const state = {
        "__DEFAULT_SCOPE__": {
            "webapp.user-detail": {
                userInfo: {
                    user: { uniqueId: "expirioapp", id: "1" },
                    stats: { followerCount: 5 }
                }
            }
        }
    };

    const html =
        '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' +
        JSON.stringify(state) +
        "</script></html>";

    const info = provider.extractUserInfo(html);

    assert.strictEqual(info.user.uniqueId, "expirioapp");

    assert.strictEqual(info.stats.followerCount, 5);

});

test("tiktok extractUserInfo returns null for foreign HTML", () => {

    const provider = new TikTokProvider();

    assert.strictEqual(
        provider.extractUserInfo("<html>login wall</html>"),
        null
    );

});

test("factory registers every configured provider type", () => {

    const factory = new ProviderFactory();

    for (const type of [
        "youtube",
        "github",
        "instagram",
        "tiktok",
        "twitch",
        "x",
        "facebook"
    ]) {

        assert.ok(
            factory.has(type),
            `missing provider '${type}'`
        );

    }

});


test("YoutubeProvider lee la clave en cada uso", () => {

    const settings = makeSettings({ youtubeApiKey: "k1" });

    const provider = new YoutubeProvider(settings);

    assert.strictEqual(provider.apiKey, "k1");

    settings.update({ secrets: { youtubeApiKey: "k2" } });

    assert.strictEqual(provider.apiKey, "k2");

});

test("Facebook usa el token de Instagram si no tiene el suyo", () => {

    const settings = makeSettings({ instagramAccessToken: "ig" });

    const provider = new FacebookProvider(settings);

    assert.strictEqual(provider.accessToken, "ig");

    settings.update({ secrets: { facebookAccessToken: "fb" } });

    assert.strictEqual(provider.accessToken, "fb");

});

test("Instagram lee el token en cada uso", () => {

    const settings = makeSettings({ instagramAccessToken: "a" });

    const provider = new InstagramProvider(settings);

    settings.update({ secrets: { instagramAccessToken: "b" } });

    assert.strictEqual(provider.accessToken, "b");

});

function stubGraph(handler) {

    const Http = require("../utils/Http");

    const original = Http.getJson;

    const calls = [];

    Http.getJson = async (url, config) => {

        calls.push({ url, params: config.params });

        return handler(url, config.params);

    };

    return {
        calls,
        restore: () => { Http.getJson = original; }
    };

}

const fakeSettings = { secret: () => "token" };

const CONNECTED = {
    id: "17841425544923467",
    username: "expirioapp",
    name: "Expirio",
    followers_count: 7
};

test("graph resolves an own account exposed only as connected_instagram_account", async () => {

    const stub = stubGraph(() => ({
        connected_instagram_account: CONNECTED,
        id: "1059480013926348"
    }));

    try {

        const provider = new InstagramProvider(fakeSettings);

        const metric =
            await provider.fetchFromGraph("expirioapp", "1059480013926348");

        assert.strictEqual(metric.value, 7);

        assert.match(
            stub.calls[0].params.fields,
            /connected_instagram_account\{/
        );

    } finally {

        stub.restore();

    }

});

test("graph uses a connected_instagram_account from /me/accounts as business discovery gateway", async () => {

    const stub = stubGraph((url) => {

        if (url.endsWith("/me/accounts")) {

            return {
                data: [{ connected_instagram_account: CONNECTED }]
            };

        }

        return {
            business_discovery: {
                username: "karug3d",
                followers_count: 99
            }
        };

    });

    try {

        const provider = new InstagramProvider(fakeSettings);

        const metric = await provider.fetchFromGraph("karug3d");

        assert.strictEqual(metric.value, 99);

        const last = stub.calls.at(-1);

        assert.ok(last.url.endsWith(`/${CONNECTED.id}`));

        assert.match(
            last.params.fields,
            /business_discovery\.username\(karug3d\)/
        );

    } finally {

        stub.restore();

    }

});

test("graph still resolves instagram_business_account on the page", async () => {

    const stub = stubGraph(() => ({
        instagram_business_account: CONNECTED
    }));

    try {

        const provider = new InstagramProvider(fakeSettings);

        const metric =
            await provider.fetchFromGraph("expirioapp", "1059480013926348");

        assert.strictEqual(metric.value, 7);

    } finally {

        stub.restore();

    }

});

test("graph sends business_discovery with the username in lowercase", async () => {

    const stub = stubGraph((url) => {

        if (url.endsWith("/me/accounts")) {

            return {
                data: [{ connected_instagram_account: CONNECTED }]
            };

        }

        return {
            business_discovery: {
                username: "cofrade_3d",
                followers_count: 12
            }
        };

    });

    try {

        const provider = new InstagramProvider(fakeSettings);

        const metric = await provider.fetchFromGraph("Cofrade_3d");

        assert.strictEqual(metric.value, 12);

        const last = stub.calls.at(-1);

        assert.match(
            last.params.fields,
            /business_discovery\.username\(cofrade_3d\)/
        );

    } finally {

        stub.restore();

    }

});
