const crypto = require("crypto");
const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

const SECRET_NAMES = [
    "youtubeApiKey",
    "githubToken",
    "twitchClientId",
    "twitchClientSecret",
    "xBearerToken",
    "facebookAccessToken",
    "instagramAccessToken",
    "facebookAppId",
    "facebookAppSecret"
];

const ENV_TO_SECRET = {
    YOUTUBE_API_KEY: "youtubeApiKey",
    GITHUB_TOKEN: "githubToken",
    TWITCH_CLIENT_ID: "twitchClientId",
    TWITCH_CLIENT_SECRET: "twitchClientSecret",
    X_BEARER_TOKEN: "xBearerToken",
    FACEBOOK_ACCESS_TOKEN: "facebookAccessToken",
    INSTAGRAM_ACCESS_TOKEN: "instagramAccessToken",
    FACEBOOK_APP_ID: "facebookAppId",
    FACEBOOK_APP_SECRET: "facebookAppSecret"
};

const CHANNEL_TYPES = ["youtube", "github", "instagram", "tiktok", "twitch", "x", "facebook"];

const BLOCKS = ["config", "secrets", "admin", "meta"];

class ValidationError extends Error {

    constructor(errors) {

        super(`Invalid configuration: ${errors.join("; ")}`);

        this.name = "ValidationError";

        this.errors = errors;

    }

}

function isPositiveInteger(value) {

    return Number.isInteger(value) && value > 0;

}

function validateChannel(channel, label, errors) {

    if (!channel || typeof channel !== "object") {
        errors.push(`${label}: el canal no es válido`);
        return;
    }

    if (!CHANNEL_TYPES.includes(channel.type)) {
        errors.push(`${label}: tipo de canal desconocido "${channel.type}"`);
        return;
    }

    if (channel.type === "youtube") {
        if (!channel.channelId) {
            errors.push(`${label}: falta el channelId`);
        }
    } else if (channel.type === "facebook") {
        if (!channel.pageId && !channel.username) {
            errors.push(`${label}: falta el pageId o el username`);
        }
    } else if (!channel.username) {
        errors.push(`${label}: falta el username`);
    }

    if (channel.cacheSeconds !== undefined && !isPositiveInteger(channel.cacheSeconds)) {
        errors.push(`${label}: cacheSeconds debe ser un entero mayor que 0`);
    }

}

function validateConfig(config) {

    const errors = [];

    if (!config || typeof config !== "object") {
        return ["La configuración no es válida"];
    }

    for (const key of ["refreshSeconds", "slideSeconds"]) {
        if (config[key] !== undefined && !isPositiveInteger(config[key])) {
            errors.push(`${key} debe ser un entero mayor que 0`);
        }
    }

    if (config.transition !== undefined && !["fade", "slide"].includes(config.transition)) {
        errors.push("transition debe ser \"fade\" o \"slide\"");
    }

    if (!Array.isArray(config.projects)) {
        errors.push("projects debe ser una lista");
        return errors;
    }

    config.projects.forEach((project, index) => {

        const label = `Proyecto ${index + 1}`;

        if (!project || typeof project !== "object") {
            errors.push(`${label}: el proyecto no es válido`);
            return;
        }

        if (typeof project.name !== "string" || project.name.trim() === "") {
            errors.push(`${label}: falta el nombre`);
        }

        if (!Array.isArray(project.channels)) {
            errors.push(`${label}: channels debe ser una lista`);
            return;
        }

        project.channels.forEach((channel, channelIndex) => {
            validateChannel(channel, `${label}, canal ${channelIndex + 1}`, errors);
        });

        if (project.primaryChannel !== undefined
            && !project.channels.some(channel => channel && channel.type === project.primaryChannel)) {
            errors.push(`${label}: primaryChannel "${project.primaryChannel}" no coincide con ningún canal`);
        }

    });

    return errors;

}

class SettingsService extends EventEmitter {

    constructor({
        file = path.join(__dirname, "..", "state", "settings.json"),
        legacyConfigFile = path.join(__dirname, "..", "config.json"),
        legacyTokenFile = path.join(__dirname, "..", "state", "instagram-token.json"),
        env = process.env
    } = {}) {

        super();

        this.file = file;

        this.legacyConfigFile = legacyConfigFile;

        this.legacyTokenFile = legacyTokenFile;

        this.env = env;

        this.data = null;

    }

    load() {

        if (!fs.existsSync(this.file)) {

            this.data = this.migrate();

            this.write(this.data);

            return;

        }

        let parsed;

        try {
            parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        } catch (error) {
            throw new Error(`settings.json is invalid: ${error.message}`);
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("settings.json is invalid: root must be an object");
        }

        this.data = {
            config: parsed.config || {},
            secrets: parsed.secrets || {},
            admin: { passwordHash: null, ...(parsed.admin || {}) },
            meta: parsed.meta || {}
        };

        if (!this.data.admin.sessionSecret) {

            this.data.admin.sessionSecret = crypto.randomBytes(32).toString("hex");

            this.write(this.data);

        }

    }

    config() {

        return this.data.config;

    }

    secret(name) {

        const value = this.data.secrets[name];

        return value === undefined ? null : value;

    }

    admin() {

        return this.data.admin;

    }

    meta() {

        return this.data.meta;

    }

    update(patch) {

        const next = {
            config: this.data.config,
            secrets: { ...this.data.secrets },
            admin: { ...this.data.admin },
            meta: { ...this.data.meta }
        };

        const changed = [];

        for (const block of BLOCKS) {

            if (patch[block] === undefined) {
                continue;
            }

            changed.push(block);

            if (block === "config") {
                next.config = patch.config;
                continue;
            }

            for (const [key, value] of Object.entries(patch[block])) {
                if (value !== undefined) {
                    next[block][key] = value;
                }
            }

        }

        const errors = validateConfig(next.config);

        if (errors.length > 0) {
            throw new ValidationError(errors);
        }

        this.write(next);

        this.data = next;

        this.emit("change", changed);

    }

    migrate() {

        const config = JSON.parse(fs.readFileSync(this.legacyConfigFile, "utf8"));

        const secrets = {};

        for (const name of SECRET_NAMES) {
            secrets[name] = null;
        }

        for (const [envName, secretName] of Object.entries(ENV_TO_SECRET)) {
            secrets[secretName] = this.env[envName] || null;
        }

        if (fs.existsSync(this.legacyTokenFile)) {

            try {

                const stored = JSON.parse(fs.readFileSync(this.legacyTokenFile, "utf8"));

                if (stored.token) {
                    secrets.instagramAccessToken = stored.token;
                }

            } catch (error) {
                console.warn(`Ignoring unreadable ${this.legacyTokenFile}: ${error.message}`);
            }

        }

        return {
            config,
            secrets,
            admin: {
                passwordHash: null,
                sessionSecret: crypto.randomBytes(32).toString("hex")
            },
            meta: {}
        };

    }

    write(data) {

        const directory = path.dirname(this.file);

        fs.mkdirSync(directory, { recursive: true });

        const temporary = path.join(directory, `.settings-${process.pid}-${Date.now()}.tmp`);

        try {

            fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");

            fs.renameSync(temporary, this.file);

        } catch (error) {

            fs.rmSync(temporary, { force: true });

            throw error;

        }

    }

}

module.exports = {
    SettingsService,
    SECRET_NAMES,
    ValidationError,
    validateConfig
};
