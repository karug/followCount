const axios = require("axios");

class Http {

    constructor() {

        this.client = axios.create({

            timeout: 15000,

            headers: {

                "User-Agent": "followCount/1.0"

            }

        });

    }

    async get(url, config = {}) {

        const response = await this.client.get(
            url,
            config
        );

        return response;

    }

    async getJson(url, config = {}) {

        const response = await this.client.get(
            url,
            {

                headers: {

                    Accept: "application/json",

                    ...(config.headers ?? {})

                },

                ...config

            }
        );

        return response.data;

    }

    async getBuffer(url, config = {}) {

        const response = await this.client.get(
            url,
            {

                responseType: "arraybuffer",

                ...config

            }
        );

        return response.data;

    }

    async post(url, body = {}, config = {}) {

        const response = await this.client.post(
            url,
            body,
            config
        );

        return response.data;

    }

}

module.exports = new Http();