import Dom from '../utils/Dom.js';
import ProjectScreen from './ProjectScreen.js';

const TRANSITION_MS = 500;

export default class ProjectView {

    #stage;

    #currentName = null;

    #currentScreen = null;

    #renderToken = 0;

    constructor() {

        this.#stage = Dom.id('stage');

        this.setTransition('fade');

    }

    /**
     * "fade" only animates the incoming screen's opacity — the
     * cheapest possible transition, smooth even on SPI panels.
     * "slide" moves both screens and needs GPU compositing.
     */
    setTransition(mode) {

        this.#stage.classList.remove(
            'stage-fade',
            'stage-slide'
        );

        this.#stage.classList.add(
            mode === 'slide'
                ? 'stage-slide'
                : 'stage-fade'
        );

    }

    async render(project) {

        // Same project (periodic refresh): update in place so the
        // odometer animates digit changes instead of transitioning.
        if (
            this.#currentScreen &&
            this.#currentName === project.name
        ) {

            this.#currentScreen.update(project);

            return;

        }

        // Renders can overlap (carousel tick + refresh); only the
        // most recent one may commit, older ones abort quietly.
        const token = ++this.#renderToken;

        const next = new ProjectScreen(project);

        // Double buffering: the incoming screen is fully built
        // and its images decoded before the transition starts.
        await next.preload();

        if (token !== this.#renderToken) {

            return;

        }

        const element = next.element;

        element.classList.add('screen-enter');

        this.#stage.appendChild(element);

        // Let the browser paint the entering state once before
        // animating. Time-capped: kiosk browsers stop firing
        // requestAnimationFrame when they think the window is
        // occluded, and an uncapped wait would hang forever.
        await this.#nextFrame();

        if (token !== this.#renderToken) {

            element.remove();

            return;

        }

        const previous = this.#currentScreen;

        this.#currentScreen = next;

        this.#currentName = project.name;

        element.classList.remove('screen-enter');

        if (previous) {

            previous.element.classList.add('screen-exit');

        }

        setTimeout(() => {

            this.#sweep();

        }, TRANSITION_MS + 100);

    }

    clear() {

        Dom.clear(this.#stage);

        this.#currentScreen = null;

        this.#currentName = null;

    }

    #nextFrame(capMs = 120) {

        return new Promise(resolve => {

            const cap = setTimeout(resolve, capMs);

            requestAnimationFrame(() => {

                requestAnimationFrame(() => {

                    clearTimeout(cap);

                    resolve();

                });

            });

        });

    }

    // Remove every screen except the current one, so aborted or
    // exited screens can never pile up in the stage.
    #sweep() {

        const current = this.#currentScreen?.element;

        [...this.#stage.children].forEach(child => {

            if (child !== current) {

                child.remove();

            }

        });

    }

}
