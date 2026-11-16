export default class ProjectViewModel {

    #project;

    constructor(project) {

        this.#project = project;

    }

    get name() {

        return this.#project.name;

    }

    get logo() {

        return this.#project.logo ?? 'assets/project-placeholder.png';

    }

    // Falls back to the first exact metric when the configured
    // primary channel failed (blocked account, API down, ...).
    // Stepped metrics (suffix, e.g. "10+") and estimated ones
    // (approximate, e.g. scraped Instagram) are never promoted:
    // the flip counter would show them as an exact figure.
    // With nothing usable there is no primary and the screen
    // shows only the cards.
    get primary() {

        return this.#project.metrics.find(
            metric => metric.type === this.#project.primary
        ) ?? this.#project.metrics.find(
            metric => !metric.metadata?.suffix
            && !metric.metadata?.approximate
        );

    }

    get handle() {

        return this.primary?.label ?? '';

    }

    get network() {

        return this.primary?.type ?? '';

    }

    get counter() {

        return this.primary?.value ?? 0;

    }

    get cards() {

        const primaryType = this.primary?.type;

        return this.#project.metrics.filter(
            metric => metric.type !== primaryType
        );

    }

    get metrics() {

        return this.#project.metrics;

    }

}
