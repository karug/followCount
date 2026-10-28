const fs = require("fs");
const path = require("path");

const ProviderFactory = require("./ProviderFactory");
const LogoService = require("./LogoService");
const CacheService = require("./CacheService");
const defaultSettings = require("./settings");

class DashboardService {

    constructor(settings = defaultSettings) {

        this.settings = settings;

        this.providers = new ProviderFactory(settings);

        this.logoService = new LogoService();

        this.cache = new CacheService();

        // Last successful metric per channel, without TTL, so a
        // transient provider failure never drops the channel.
        // Persisted so a restart during a rate-limit window still
        // has values to show.
        this.lastGood = new Map();

        // Per-channel failure tracking, keyed like the metric cache.
        this.channelHealth = new Map();

        // A config or secret edit must show on the next build, not
        // after the cache expires.
        this.settings.on("change", changed => {

            if (changed.includes("config") || changed.includes("secrets")) {

                this.cache.clear();

            }

        });

        // Not under cache/: that directory is served publicly at
        // /cache for logos.
        this.lastGoodFile = path.join(
            __dirname,
            "..",
            "state",
            "metrics.json"
        );

    }

    get config() {

        return this.settings.config();

    }

    async initialize() {

        this.loadLastGood();

    }

    loadLastGood() {

        try {

            const entries = JSON.parse(
                fs.readFileSync(this.lastGoodFile, "utf8")
            );

            this.lastGood = new Map(entries);

        } catch (error) {

            // Missing or corrupt file: start empty.

        }

    }

    saveLastGood() {

        try {

            fs.mkdirSync(
                path.dirname(this.lastGoodFile),
                { recursive: true }
            );

            fs.writeFileSync(
                this.lastGoodFile,
                JSON.stringify([...this.lastGood.entries()])
            );

        } catch (error) {

            console.warn(
                `Unable to persist metrics: ${error.message}`
            );

        }

    }

    async build() {

        const cacheKey = "dashboard";

        const cached = this.cache.get(cacheKey);

        if (cached) {

            return cached;

        }

        const projects = [];

        for (const project of this.config.projects) {

            projects.push(
                await this.buildProject(project)
            );

        }

        const dashboard = {

            generatedAt: new Date().toISOString(),

            refreshSeconds:
                this.config.refreshSeconds ?? 60,

            slideSeconds:
                this.config.slideSeconds ?? 8,

            // "fade" reads better on low-fps SPI panels; "slide"
            // for displays with real GPU compositing.
            transition:
                this.config.transition ?? "fade",

            projects

        };

        this.cache.put(
            cacheKey,
            dashboard,
            this.config.refreshSeconds ?? 60
        );

        for (const project of projects) {

            console.log(
                `Dashboard built: ${project.name} -> ` +
                project.metrics
                    .map(metric => `${metric.type}=${metric.value}`)
                    .join(" ")
            );

        }

        return dashboard;

    }

    async fetchMetric(provider, channel) {

        const cacheKey =
            "metric:" + JSON.stringify(channel);

        const cached =
            this.cache.get(cacheKey);

        if (cached) {

            if (cached.failed) {

                throw new Error(
                    `Provider '${channel.type}' in cooldown after failure`
                );

            }

            return cached;

        }

        let metric;

        try {

            metric =
                await provider.fetch(channel);

        } catch (error) {

            this.recordFailure(cacheKey, error);

            const stale =
                this.lastGood.get(cacheKey);

            if (!stale) {

                // Negative cache: retrying a failing channel on
                // every rebuild hammers the platform and keeps
                // rate limits from ever lifting.
                this.cache.put(
                    cacheKey,
                    { failed: true },
                    channel.cacheSeconds ??
                        this.config.refreshSeconds ??
                        60
                );

                throw error;

            }

            console.warn(
                `Provider '${channel.type}' failed, serving last ` +
                `known value: ${error.message}`
            );

            return stale;

        }

        // channel.cacheSeconds allows per-channel TTLs longer than
        // the dashboard refresh (e.g. GitHub rate limits).
        const ttl =
            channel.cacheSeconds ??
            this.config.refreshSeconds ??
            60;

        this.cache.put(
            cacheKey,
            metric,
            ttl
        );

        this.lastGood.set(cacheKey, metric);

        this.recordSuccess(cacheKey);

        this.saveLastGood();

        return metric;

    }

    recordSuccess(cacheKey) {

        this.channelHealth.set(cacheKey, {
            failingSince: null,
            lastError: this.channelHealth.get(cacheKey)?.lastError ?? null,
            lastSuccessAt: Date.now()
        });

    }

    recordFailure(cacheKey, error) {

        const previous = this.channelHealth.get(cacheKey);

        this.channelHealth.set(cacheKey, {
            failingSince: previous?.failingSince ?? Date.now(),
            lastError: error.message,
            lastSuccessAt: previous?.lastSuccessAt ?? null
        });

    }

    async buildProject(project) {

        const metrics = [];

        for (const channel of project.channels) {

            const provider =
                this.providers.get(channel.type);

            if (!provider) {

                console.warn(
                    `Unknown provider '${channel.type}'`
                );

                continue;

            }

            try {

                const metric =
                    await this.fetchMetric(
                        provider,
                        channel
                    );

                metrics.push(metric);

            } catch (error) {

                console.error(error);

            }

        }

        let logo =
            project.logo ??
            null;

        if (!logo && metrics.length > 0) {

            logo =
                metrics[0].logo ??
                null;

        }

        if (logo) {

            logo =
                await this.logoService.resolve(logo);

        }

        return {

            name: project.name,

            logo,

            primary:
                project.primaryChannel,

            metrics

        };

    }

}

module.exports = DashboardService;