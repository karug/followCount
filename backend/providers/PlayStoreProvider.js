const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class PlayStoreProvider {

    async fetch(channel) {

        const html = await this.fetchHtml(channel.packageName);

        const installs = this.extractInstalls(html);

        if (!installs) {

            throw new Error(
                `Play Store app '${channel.packageName}' has no installs data`
            );

        }

        return this.toMetric(installs, channel.packageName);

    }

    async fetchHtml(packageName) {

        const response = await Http.get(
            this.buildUrl(packageName),
            {

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/126.0.0.0 Safari/537.36",

                    Accept: "text/html"

                }

            }
        );

        return response.data;

    }

    buildUrl(packageName) {

        return "https://play.google.com/store/apps/details" +
            `?id=${encodeURIComponent(packageName)}&hl=es&gl=es`;

    }

    extractInstalls(html) {

        // The listing embeds the installs as ["10+",10,18,"10+"]:
        // label, floor and ceiling of the bucket Google shows.
        const match = html.match(
            /\["(\d[\d., \s]*\+?)",(\d+),(\d+),"/
        );

        if (!match) {

            return null;

        }

        return {

            text: match[1],

            min: Number(match[2]),

            max: Number(match[3])

        };

    }

    toMetric(installs, packageName) {

        return new Metric({

            type: "playstore",

            label: packageName,

            value: installs.min,

            logo: null,

            metadata: {

                text: installs.text,

                min: installs.min,

                max: installs.max,

                suffix: installs.text.endsWith("+") ? "+" : "",

                url: this.buildUrl(packageName)

            }

        });

    }

}

module.exports = PlayStoreProvider;
