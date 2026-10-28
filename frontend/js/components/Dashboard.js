import Api from '../services/Api.js';
import Carousel from './Carousel.js';
import ProjectView from './ProjectView.js';
import StatusBar from './StatusBar.js';
import ProjectViewModel from '../viewmodels/ProjectViewModel.js';

// A kiosk runs unattended for months. If the tab wedges for any
// reason we didn't anticipate (network stack stall, memory leak,
// a browser quirk), the only reliable fix is a full reload rather
// than trying to enumerate every possible failure mode.
const WATCHDOG_MULTIPLIER = 3;

const WATCHDOG_MIN_MS = 5 * 60 * 1000;

// The first request after a cold boot can be slow or fail while the
// backend warms up. Retry with backoff instead of giving up, since
// nobody is there to reload the page.
const START_RETRY_MIN_MS = 2000;

const START_RETRY_MAX_MS = 30000;

export default class Dashboard {

    #statusBar;

    #carousel;

    #projectView;

    #projects = [];

    #lastSuccessAt = Date.now();

    #loadedAt = Date.now();

    constructor() {

        this.#statusBar = new StatusBar();

        this.#carousel = new Carousel();

        this.#projectView = new ProjectView();

    }

    async start() {

        this.#statusBar.start();

        await this.#refreshUntilSuccess();

        this.#carousel.onChange((project, index) => {

            this.#projectView.render(project);

            this.#sendHeartbeat(index);

        });

        this.#sendHeartbeat(this.#carousel.currentIndex());

        this.#carousel.start(
            this.#slideMilliseconds()
        );

        this.#startRefreshLoop();

        this.#startWatchdog();

    }

    async #refreshUntilSuccess() {

        let delay = START_RETRY_MIN_MS;

        while (true) {

            try {

                await this.refresh();

                return;

            } catch (error) {

                console.error(
                    `Initial load failed, retrying in ${Math.round(delay / 1000)}s.`,
                    error
                );

                await new Promise(resolve => setTimeout(resolve, delay));

                delay = Math.min(delay * 2, START_RETRY_MAX_MS);

            }

        }

    }

    async refresh() {

        await Api.load();

        this.#lastSuccessAt = Date.now();

        this.#projectView.setTransition(
            Api.dashboard?.transition ?? 'fade'
        );

        this.#statusBar.setAlerts(Api.dashboard?.alerts ?? []);

        this.#projects = Api.projects.map(
            project => new ProjectViewModel(project)
        );

        this.#carousel.stop();

        this.#carousel.setProjects(this.#projects);

        if (this.#projects.length > 0) {

            this.#projectView.render(
                this.#projects[this.#carousel.currentIndex()] ??
                this.#projects[0]
            );

        }

    }

    #startRefreshLoop() {

        setInterval(async () => {

            try {

                const current =
                    this.#carousel.currentIndex();

                await this.refresh();

                // A deleted project can leave the old index out of range.
                const target = current < this.#projects.length ? current : 0;

                this.#carousel.go(target);

                // Covers decks with a single slide, which never change.
                this.#sendHeartbeat(target);

                this.#carousel.start(
                    this.#slideMilliseconds()
                );

            } catch (error) {

                console.error(error);

            }

        }, this.#refreshMilliseconds());

    }

    #startWatchdog() {

        setInterval(() => {

            // Recomputed on every tick: refreshSeconds can change
            // via a settings change, and a threshold fixed at
            // startup would drift out of sync with it.
            const threshold = Math.max(
                this.#refreshMilliseconds() * WATCHDOG_MULTIPLIER,
                WATCHDOG_MIN_MS
            );

            const staleFor =
                Date.now() - this.#lastSuccessAt;

            if (staleFor > threshold) {

                console.error(
                    `No successful refresh in ${Math.round(staleFor / 1000)}s, reloading.`
                );

                window.location.reload();

            }

        }, 30000);

    }

    #sendHeartbeat(slide) {

        Api.heartbeat({
            slide,
            visibility: document.visibilityState,
            uptimeSeconds: Math.round((Date.now() - this.#loadedAt) / 1000)
        });

    }

    #refreshMilliseconds() {

        return (Api.dashboard?.refreshSeconds ?? 60) * 1000;

    }

    #slideMilliseconds() {

        return (Api.dashboard?.slideSeconds ?? 8) * 1000;

    }

}
