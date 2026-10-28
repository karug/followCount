const { execFile } = require("child_process");
const { promisify } = require("util");

const EXIT_DELAY_MS = 500;

const COMMANDS = {
    "restart-kiosk": ["sudo", ["-n", "systemctl", "restart", "followcount-kiosk"]],
    "reboot": ["sudo", ["-n", "systemctl", "reboot"]]
};

// Host-level actions of the admin panel. Fixed commands only, run
// without a shell.
class SystemActions {

    constructor({
        run = promisify(execFile),
        exit = process.exit,
        platform = process.platform
    } = {}) {

        this.run = run;

        this.exit = exit;

        this.platform = platform;

    }

    knows(name) {

        return name === "restart-backend" || Object.hasOwn(COMMANDS, name);

    }

    available() {

        return this.platform === "linux";

    }

    async execute(name) {

        const [command, args] = COMMANDS[name];

        await this.run(command, args);

    }

    // Delayed so the HTTP response is flushed before the process dies.
    scheduleExit() {

        setTimeout(() => this.exit(0), EXIT_DELAY_MS);

    }

}

module.exports = SystemActions;
