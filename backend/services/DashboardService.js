const fs = require("fs");
const path = require("path");

const ProviderFactory = require("./ProviderFactory");
const LogoService = require("./LogoService");
const CacheService = require("./CacheService");

class DashboardService {

    constructor() {

        this.config = null;

        this.providers = new ProviderFactory();

        this.logoService = new LogoService();

        this.cache = new CacheService();

    }

    async initialize() {

        this.loadConfiguration();

    }

    loadConfiguration() {

        const configFile = path.join(
            __dirname,
            "..",
            "config.json"
        );

        this.config = JSON.parse(
            fs.readFileSync(configFile, "utf8")
        );

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

            projects

        };

        this.cache.put(
            cacheKey,
            dashboard,
            this.config.refreshSeconds ?? 60
        );

        return dashboard;

    }

    async fetchMetric(provider, channel) {

        const cacheKey =
            "metric:" + JSON.stringify(channel);

        const cached =
            this.cache.get(cacheKey);

        if (cached) {

            return cached;

        }

        const metric =
            await provider.fetch(channel);

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

        return metric;

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