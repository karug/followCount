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
            `?id=${encodeURIComponent(String(packageName).trim())}&hl=es&gl=es`;

    }

    extractInstalls(html) {

        if (typeof html !== "string") {

            return null;

        }

        // The listing embeds the installs as ["10+",10,18,"10+"]:
        // label, floor and ceiling of the bucket Google shows, and
        // the label again. Requiring that repeat (\1) anchors the
        // pattern: any other four-field array would publish a wrong
        // number as good, and lastGood would keep it for ever.
        const match = html.match(
            /\["(\d[\d.,\s]*\+?)",(\d+),(\d+),"\1"/
        );

        if (!match) {

            return null;

        }

        const min = Number(match[2]);

        const max = Number(match[3]);

        if (min > max) {

            return null;

        }

        return {

            text: match[1],

            min,

            max

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
