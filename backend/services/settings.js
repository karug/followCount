const { SettingsService } = require("./SettingsService");

// Shared instance; server.js calls load() at startup.
module.exports = new SettingsService();
