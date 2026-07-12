const Metric = require("../models/Metric");

class TwitchProvider {

    async fetch(channel) {

        return new Metric({

            type: "twitch",

            label: channel.username,

            value: 0,

            logo: null,

            metadata: {}

        });

    }

}

module.exports = TwitchProvider;