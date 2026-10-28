const YoutubeProvider = require("../providers/YoutubeProvider");
const GithubProvider = require("../providers/GithubProvider");
const InstagramProvider = require("../providers/InstagramProvider");
const TikTokProvider = require("../providers/TikTokProvider");
const TwitchProvider = require("../providers/TwitchProvider");
const XProvider = require("../providers/XProvider");
const FacebookProvider = require("../providers/FacebookProvider");

const defaultSettings = require("./settings");

class ProviderFactory {

    constructor(settings = defaultSettings) {

        this.providers = new Map();

        this.register("youtube", new YoutubeProvider(settings));
        this.register("github", new GithubProvider(settings));
        this.register("instagram", new InstagramProvider(settings));
        this.register("tiktok", new TikTokProvider());
        this.register("twitch", new TwitchProvider(settings));
        this.register("x", new XProvider(settings));
        this.register("facebook", new FacebookProvider(settings));

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