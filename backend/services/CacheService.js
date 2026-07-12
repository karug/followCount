class CacheService {

    constructor() {

        this.cache = new Map();

    }

    get(key) {

        const entry = this.cache.get(key);

        if (!entry) {

            return null;

        }

        if (entry.expires <= Date.now()) {

            this.cache.delete(key);

            return null;

        }

        return entry.value;

    }

    put(key, value, ttlSeconds = 60) {

        this.cache.set(key, {

            value,

            expires: Date.now() + (ttlSeconds * 1000)

        });

    }

    has(key) {

        return this.get(key) !== null;

    }

    remove(key) {

        this.cache.delete(key);

    }

    clear() {

        this.cache.clear();

    }

    size() {

        return this.cache.size;

    }

    keys() {

        return [...this.cache.keys()];

    }

    cleanup() {

        const now = Date.now();

        for (const [key, value] of this.cache.entries()) {

            if (value.expires <= now) {

                this.cache.delete(key);

            }

        }

    }

    start(intervalSeconds = 60) {

        setInterval(() => {

            this.cleanup();

        }, intervalSeconds * 1000);

    }

}

module.exports = CacheService;