export default class Api {
    static #dashboard = null;
    static async load() {
        const response = await fetch('/api/dashboard');
        if (!response.ok) throw new Error('Unable to load dashboard');
        this.#dashboard = await response.json();
        return this.#dashboard;
    }
    static get dashboard() { return this.#dashboard; }
    static get projects() { return this.#dashboard?.projects ?? []; }
    static getProject(index) { return this.projects[index]; }
}
