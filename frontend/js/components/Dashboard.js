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

export default class Dashboard {

    #statusBar;

    #carousel;

    #projectView;

    #projects = [];

    #lastSuccessAt = Date.now();

    constructor() {

        this.#statusBar = new StatusBar();

        this.#carousel = new Carousel();

        this.#projectView = new ProjectView();

    }

    async start() {

        this.#statusBar.start();

        await this.refresh();

        this.#carousel.onChange(project => {

            this.#projectView.render(project);

        });

        this.#carousel.start(
            this.#slideMilliseconds()
        );

        this.#startRefreshLoop();

        this.#startWatchdog();

    }

    async refresh() {

        await Api.load();

        this.#lastSuccessAt = Date.now();

        this.#projectView.setTransition(
            Api.dashboard?.transition ?? 'fade'
        );

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

                this.#carousel.go(current);

                this.#carousel.start(
                    this.#slideMilliseconds()
                );

            } catch (error) {

                console.error(error);

            }

        }, this.#refreshMilliseconds());

    }

    #startWatchdog() {

        const threshold = Math.max(
            this.#refreshMilliseconds() * WATCHDOG_MULTIPLIER,
            WATCHDOG_MIN_MS
        );

        setInterval(() => {

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

    #refreshMilliseconds() {

        return (Api.dashboard?.refreshSeconds ?? 60) * 1000;

    }

    #slideMilliseconds() {

        return (Api.dashboard?.slideSeconds ?? 8) * 1000;

    }

}
