const Metric = require("../models/Metric");

class InstagramProvider {

    async fetch(channel) {

        return new Metric({

            type: "instagram",

            label: channel.username,

            value: 0,

            logo: null,

            metadata: {}

        });

    }

}

module.exports = InstagramProvider;