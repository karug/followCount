const Metric = require("../models/Metric");

class TikTokProvider {

    async fetch(channel) {

        return new Metric({

            type: "tiktok",

            label: channel.username,

            value: 0,

            logo: null,

            metadata: {}

        });

    }

}

module.exports = TikTokProvider;