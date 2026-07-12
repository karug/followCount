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

    // Falls back to the first available metric when the configured
    // primary channel failed (blocked account, API down, ...), so
    // the main counter never renders empty.
    get primary() {

        return this.#project.metrics.find(
            metric => metric.type === this.#project.primary
        ) ?? this.#project.metrics[0];

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
