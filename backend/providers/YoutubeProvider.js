const Http = require("../utils/Http");
const Metric = require("../models/Metric");
const defaultSettings = require("../services/settings");

class YoutubeProvider {

    constructor(settings = defaultSettings) {

        this.settings = settings;

    }

    // Read live so a key changed from the admin panel applies at once.
    get apiKey() {

        return this.settings.secret("youtubeApiKey");

    }

    async fetch(channel) {

        if (!this.apiKey) {

            throw new Error(
                "Missing YouTube API key in settings"
            );

        }

        const response = await Http.getJson(

            "https://www.googleapis.com/youtube/v3/channels",

            {

                params: {

                    part: "snippet,statistics",

                    id: channel.channelId,

                    key: this.apiKey

                }

            }

        );

        if (!response.items || response.items.length === 0) {

            throw new Error(
                `Channel '${channel.channelId}' not found`
            );

        }

        const youtube = response.items[0];

        return new Metric({

            type: "youtube",

            label:
                youtube.snippet.customUrl ??
                youtube.snippet.title,

            value: Number(
                youtube.statistics.subscriberCount
            ),

            logo:
                youtube.snippet.thumbnails.high?.url ??
                youtube.snippet.thumbnails.medium?.url ??
                youtube.snippet.thumbnails.default?.url,

            metadata: {

                channelId: youtube.id,

                title: youtube.snippet.title,

                description:
                    youtube.snippet.description,

                subscribers: Number(
                    youtube.statistics.subscriberCount
                ),

                videos: Number(
                    youtube.statistics.videoCount
                ),

                views: Number(
                    youtube.statistics.viewCount
                ),

                publishedAt:
                    youtube.snippet.publishedAt

            }

        });

    }

}

module.exports = YoutubeProvider;