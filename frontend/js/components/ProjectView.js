import Dom from '../utils/Dom.js';
import ProjectScreen from './ProjectScreen.js';

const TRANSITION_MS = 500;

export default class ProjectView {

    #stage;

    #currentName = null;

    #currentScreen = null;

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

        const next = new ProjectScreen(project);

        // Double buffering: the incoming screen is fully built
        // and its images decoded before the transition starts.
        await next.preload();

        const element = next.element;

        element.classList.add('screen-enter');

        this.#stage.appendChild(element);

        // Let the browser paint the entering state once before
        // animating, so the first transition frame is not spent
        // on layout/paint of the new screen.
        await new Promise(resolve =>
            requestAnimationFrame(() =>
                requestAnimationFrame(resolve)
            )
        );

        const previous = this.#currentScreen;

        this.#currentScreen = next;

        this.#currentName = project.name;

        element.classList.remove('screen-enter');

        if (previous) {

            previous.element.classList.add('screen-exit');

            setTimeout(() => {

                previous.element.remove();

            }, TRANSITION_MS + 100);

        }

    }

    clear() {

        Dom.clear(this.#stage);

        this.#currentScreen = null;

        this.#currentName = null;

    }

}
