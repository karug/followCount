export default class Api {

    static #dashboard = null;

    static async load(timeoutMs = 10000) {

        const controller = new AbortController();

        // A hung request (network stack wedged, interface flap)
        // must never freeze the refresh loop forever.
        const timeout = setTimeout(
            () => controller.abort(),
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
