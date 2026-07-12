export default class ProjectViewModel {
    #project;
    constructor(project) { this.#project = project; }
    get name() { return this.#project.name; }
    get logo() { return this.#project.logo ?? 'assets/project-placeholder.png'; }
    get primary() { return this.#project.metrics.find(metric => metric.type === this.#project.primary); }
    get handle() { return this.primary?.label ?? ''; }
    get network() { return this.primary?.type ?? ''; }
    get counter() { return this.primary?.value ?? 0; }
    get cards() { return this.#project.metrics.filter(metric => metric.type !== this.#project.primary); }
    get metrics() { return this.#project.metrics; }
}
