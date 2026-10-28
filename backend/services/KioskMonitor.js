const MIN_THRESHOLD_SECONDS = 180;

const THRESHOLD_MULTIPLIER = 3;

// Tracks the heartbeat the kiosk page sends on every slide change,
// so a process outside the browser can tell when the screen froze.
class KioskMonitor {

    // timing: () => ({ slideSeconds, refreshSeconds }), read on every
    // call because the settings can change at runtime.
    constructor(timing = () => ({}), now = () => Date.now()) {

        this.timing = timing;

        this.now = now;

        this.startedAt = now();

        this.lastHeartbeatAt = null;

        this.last = null;

    }

    record(payload) {

        this.lastHeartbeatAt = this.now();

        this.last = payload ?? null;

    }

    thresholdSeconds() {

        const { slideSeconds, refreshSeconds } = this.timing() ?? {};

        const slowest = Math.max(
            Number(slideSeconds) || 8,
            Number(refreshSeconds) || 60
        );

        return Math.max(
            MIN_THRESHOLD_SECONDS,
            THRESHOLD_MULTIPLIER * slowest
        );

    }

    status() {

        const now = this.now();

        const thresholdSeconds = this.thresholdSeconds();

        // Before the first heartbeat the age counts from backend start,
        // so a freshly started backend is not reported as stale.
        const reference = this.lastHeartbeatAt ?? this.startedAt;

        const ageSeconds = Math.round((now - reference) / 1000);

        return {
            lastHeartbeatAt: this.lastHeartbeatAt === null
                ? null
                : new Date(this.lastHeartbeatAt).toISOString(),
            ageSeconds,
            uptimeSeconds: Math.round((now - this.startedAt) / 1000),
            thresholdSeconds,
            stale: ageSeconds > thresholdSeconds,
            last: this.last
        };

    }

}

module.exports = KioskMonitor;
