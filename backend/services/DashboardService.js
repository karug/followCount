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

            projects

        };

        this.cache.put(
            cacheKey,
            dashboard,
            this.config.refreshSeconds ?? 60
        );

        return dashboard;

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
                    await provider.fetch(channel);

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