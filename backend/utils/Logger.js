const fs = require("fs");
const path = require("path");

class Logger {

    constructor() {

        this.logDirectory = path.join(
            __dirname,
            "..",
            "logs"
        );

        fs.mkdirSync(
            this.logDirectory,
            {
                recursive: true
            }
        );

        this.logFile = path.join(
            this.logDirectory,
            "followCount.log"
        );

    }

    info(message, ...args) {

        this.write(
            "INFO",
            message,
            ...args
        );

    }

    warn(message, ...args) {

        this.write(
            "WARN",
            message,
            ...args
        );

    }

    error(message, ...args) {

        this.write(
            "ERROR",
            message,
            ...args
        );

    }

    debug(message, ...args) {

        if (
            process.env.NODE_ENV === "production"
        ) {

            return;

        }

        this.write(
            "DEBUG",
            message,
            ...args
        );

    }

    write(level, message, ...args) {

        const line = this.format(
            level,
            message,
            args
        );

        console.log(line);

        fs.appendFileSync(
            this.logFile,
            line + "\n"
        );

    }

    format(level, message, args) {

        const timestamp =
            new Date().toISOString();

        let text =
            `[${timestamp}] [${level}] ${message}`;

        if (args.length > 0) {

            text +=
                " " +
                args.map(value => {

                    if (
                        typeof value === "string"
                    ) {

                        return value;

                    }

                    return JSON.stringify(
                        value,
                        null,
                        2
                    );

                }).join(" ");

        }

        return text;

    }

}

module.exports = new Logger();