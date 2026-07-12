process.env.YOUTUBE_API_KEY ??= "test-key";

const test = require("node:test");
const assert = require("node:assert");

const InstagramProvider = require("../providers/InstagramProvider");
const FacebookProvider = require("../providers/FacebookProvider");
const TikTokProvider = require("../providers/TikTokProvider");
const ProviderFactory = require("../services/ProviderFactory");

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
