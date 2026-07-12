const Http = require("../utils/Http");
const Metric = require("../models/Metric");

class YoutubeProvider {

    constructor() {

        this.apiKey = process.env.YOUTUBE_API_KEY;

        if (!this.apiKey) {

            throw new Error(
                "Missing YOUTUBE_API_KEY in .env"
            );

        }

    }

    async fetch(channel) {

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