const YoutubeProvider = require("../providers/YoutubeProvider");
const GithubProvider = require("../providers/GithubProvider");
const InstagramProvider = require("../providers/InstagramProvider");
const TikTokProvider = require("../providers/TikTokProvider");
const TwitchProvider = require("../providers/TwitchProvider");
const XProvider = require("../providers/XProvider");

class ProviderFactory {

    constructor() {

        this.providers = new Map();

        this.register("youtube", new YoutubeProvider());
        this.register("github", new GithubProvider());
        this.register("instagram", new InstagramProvider());
        this.register("tiktok", new TikTokProvider());
        this.register("twitch", new TwitchProvider());
        this.register("x", new XProvider());

    }

    register(type, provider) {

        this.providers.set(
            type.toLowerCase(),
            provider
        );

    }

    unregister(type) {

        this.providers.delete(
            type.toLowerCase()
        );

    }

    get(type) {

        return this.providers.get(
            type.toLowerCase()
        );

    }

    has(type) {

        return this.providers.has(
            type.toLowerCase()
        );

    }

    supportedTypes() {

        return [...this.providers.keys()];

    }

}

module.exports = ProviderFactory;