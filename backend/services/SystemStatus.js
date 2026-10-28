const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const CACHE_MS = 30 * 1000;

// Bits of `vcgencmd get_throttled`.
const UNDERVOLTAGE_NOW = 1 << 0;
const THROTTLED_NOW = 1 << 2;
const UNDERVOLTAGE_SINCE_BOOT = 1 << 16;

const UNAVAILABLE = {
    available: false,
    undervoltageNow: false,
    undervoltageSinceBoot: false,
    throttledNow: false,
    raw: null,
    armHz: null,
    memAvailableMb: null
};

class SystemStatus {

    constructor({ run = promisify(execFile), now = Date.now, meminfoFile = "/proc/meminfo" } = {}) {

        this.run = run;

        this.now = now;

        this.meminfoFile = meminfoFile;

        this.cached = null;

        this.cachedAt = 0;

    }

    async read() {

        if (this.cached && this.now() - this.cachedAt < CACHE_MS) {

            return this.cached;

        }

        this.cached = await this.query();

        this.cachedAt = this.now();

        return this.cached;

    }

    async query() {

        try {

            const throttled = await this.run("vcgencmd", ["get_throttled"]);

            const raw = /throttled=(0x[0-9a-fA-F]+)/.exec(String(throttled.stdout))?.[1];

            if (!raw) {

                return { ...UNAVAILABLE };

            }

            const bits = parseInt(raw, 16);

            return {
                available: true,
                undervoltageNow: (bits & UNDERVOLTAGE_NOW) !== 0,
                undervoltageSinceBoot: (bits & UNDERVOLTAGE_SINCE_BOOT) !== 0,
                throttledNow: (bits & THROTTLED_NOW) !== 0,
                raw,
                armHz: await this.readArmHz(),
                memAvailableMb: this.readMemAvailableMb()
            };

        } catch (error) {

            return { ...UNAVAILABLE };

        }

    }

    async readArmHz() {

        try {

            const clock = await this.run("vcgencmd", ["measure_clock", "arm"]);

            const hz = Number(/=(\d+)/.exec(String(clock.stdout))?.[1]);

            return Number.isFinite(hz) ? hz : null;

        } catch (error) {

            return null;

        }

    }

    readMemAvailableMb() {

        try {

            const text = fs.readFileSync(this.meminfoFile, "utf8");

            const kb = Number(/^MemAvailable:\s+(\d+)\s+kB/m.exec(text)?.[1]);

            return Number.isFinite(kb) ? Math.round(kb / 1024) : null;

        } catch (error) {

            return null;

        }

    }

}

module.exports = SystemStatus;
