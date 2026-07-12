import Dom from '../utils/Dom.js';
import ProjectScreen from './ProjectScreen.js';

const TRANSITION_MS = 500;

export default class ProjectView {

    #stage;

    #currentName = null;

    #currentScreen = null;

    constructor() {

        this.#stage = Dom.id('stage');

    }

    async render(project) {

        // Same project (periodic refresh): update in place so the
        // odometer animates digit changes instead of sliding.
        if (
            this.#currentScreen &&
            this.#currentName === project.name
        ) {

            this.#currentScreen.update(project);

            return;

        }

        const next = new ProjectScreen(project);

        // Double buffering: the incoming screen is fully built
        // and its images decoded before the slide starts.
        await next.preload();

        const element = next.element;

        element.classList.add('screen-enter');

        this.#stage.appendChild(element);

        // Force layout so the enter position is committed before
        // the transition class is removed.
        element.getBoundingClientRect();

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
