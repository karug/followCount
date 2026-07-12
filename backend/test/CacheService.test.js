const test = require("node:test");
const assert = require("node:assert");

const CacheService = require("../services/CacheService");

test("returns stored value before expiry", () => {

    const cache = new CacheService();

    cache.put("key", "value", 60);

    assert.strictEqual(cache.get("key"), "value");

});

test("expires entries after their TTL", async () => {

    const cache = new CacheService();

    cache.put("key", "value", 0.01);

    await new Promise(resolve => setTimeout(resolve, 30));

    assert.strictEqual(cache.get("key"), null);

});

test("has() and remove() behave consistently", () => {

    const cache = new CacheService();

    cache.put("key", 123, 60);

    assert.strictEqual(cache.has("key"), true);

    cache.remove("key");

    assert.strictEqual(cache.has("key"), false);

});

test("cleanup() drops only expired entries", async () => {

    const cache = new CacheService();

    cache.put("fresh", 1, 60);

    cache.put("stale", 2, 0.01);

    await new Promise(resolve => setTimeout(resolve, 30));

    cache.cleanup();

    assert.strictEqual(cache.size(), 1);

    assert.deepStrictEqual(cache.keys(), ["fresh"]);

});
