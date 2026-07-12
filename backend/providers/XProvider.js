const Metric = require("../models/Metric");

class XProvider {

    async fetch(channel) {

        return new Metric({

            type: "x",

            label: channel.username,

            value: 0,

            logo: null,

            metadata: {}

        });

    }

}

module.exports = XProvider;