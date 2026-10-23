export default class Api {

    static #dashboard = null;

    static async load(timeoutMs = 60000) {

        const controller = new AbortController();

        // A hung request (network stack wedged, interface flap)
        // must never freeze the refresh loop forever. The limit sits
        // above the backend's worst cold-start case (serial scraping,
        // 15s per upstream request), and the abort reason keeps the
        // error readable instead of "signal is aborted without reason".
        const timeout = setTimeout(
            () => controller.abort(new Error(
                `Dashboard request timed out after ${Math.round(timeoutMs / 1000)}s`
            )),
            timeoutMs
        );

        try {

            const response = await fetch('/api/dashboard', {
                signal: controller.signal
            });

            if (!response.ok) {

                throw new Error('Unable to load dashboard');

            }

            this.#dashboard = await response.json();

            return this.#dashboard;

        } finally {

            clearTimeout(timeout);

        }

    }

    // Fire-and-forget liveness signal for the out-of-browser watchdog.
    // It must never throw or block the UI, whatever happens to the request.
    static heartbeat(payload, timeoutMs = 5000) {

        try {

            const controller = new AbortController();

            const timeout = setTimeout(
                () => controller.abort(new Error(
                    `Heartbeat timed out after ${Math.round(timeoutMs / 1000)}s`
                )),
                timeoutMs
            );

            fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            })
                .catch(() => {})
                .finally(() => clearTimeout(timeout));

        } catch (error) {

            // Ignored on purpose: a missed heartbeat is not an app error.

        }

    }

    static get dashboard() {

        return this.#dashboard;

    }

    static get projects() {

        return this.#dashboard?.projects ?? [];

    }

    static getProject(index) {

        return this.projects[index];

    }

}
