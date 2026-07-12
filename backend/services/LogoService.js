const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

class LogoService {

    constructor() {

        this.cacheDirectory = path.join(
            __dirname,
            "..",
            "cache",
            "logos"
        );

        fs.mkdirSync(
            this.cacheDirectory,
            {
                recursive: true
            }
        );

    }

    async resolve(url) {

        if (!url) {

            return null;

        }

        if (
            url.startsWith("/cache/logos/")
        ) {

            return url;

        }

        const extension =
            this.getExtension(url);

        const filename =
            this.hash(url) + extension;

        const destination =
            path.join(
                this.cacheDirectory,
                filename
            );

        if (!fs.existsSync(destination)) {

            await this.download(
                url,
                destination
            );

        }

        return `/cache/logos/${filename}`;

    }

    async download(url, destination) {

        const response =
            await axios.get(url, {

                responseType: "arraybuffer"

            });

        fs.writeFileSync(
            destination,
            response.data
        );

    }

    hash(value) {

        return crypto
            .createHash("sha1")
            .update(value)
            .digest("hex");

    }

    getExtension(url) {

        const pathname =
            new URL(url).pathname;

        const extension =
            path.extname(pathname);

        if (!extension) {

            return ".png";

        }

        return extension;

    }

}

module.exports = LogoService;