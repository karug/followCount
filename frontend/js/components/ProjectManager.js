import ProjectViewModel from '../viewmodels/ProjectViewModel.js';
export default class ProjectManager {
    #projects = []; #index = 0;
    load(projects) { this.#projects = projects.map(project => new ProjectViewModel(project)); this.#index = 0; }
    replace(projects) { const currentName = this.current()?.name; this.#projects = projects.map(project => new ProjectViewModel(project)); const index = this.#projects.findIndex(project => project.name === currentName); this.#index = index >= 0 ? index : 0; }
    current() { return this.#projects[this.#index]; }
    next() { if (this.#projects.length === 0) return null; this.#index++; if (this.#index >= this.#projects.length) this.#index = 0; return this.current(); }
    previous() { if (this.#projects.length === 0) return null; this.#index--; if (this.#index < 0) this.#index = this.#projects.length - 1; return this.current(); }
    go(index) { if (index < 0 || index >= this.#projects.length) return; this.#index = index; }
    index() { return this.#index; }
    count() { return this.#projects.length; }
    all() { return this.#projects; }
}
