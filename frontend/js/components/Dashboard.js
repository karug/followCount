import Api from '../services/Api.js';
import Carousel from './Carousel.js';
import ProjectView from './ProjectView.js';
import StatusBar from './StatusBar.js';
import ProjectViewModel from '../viewmodels/ProjectViewModel.js';
export default class Dashboard {
    #statusBar; #carousel; #projectView; #projects = [];
    constructor() { this.#statusBar = new StatusBar(); this.#carousel = new Carousel(); this.#projectView = new ProjectView(); }
    async start() { this.#statusBar.start(); await this.refresh(); this.#carousel.onChange(project => { this.#projectView.render(project); }); this.#carousel.start(8000); this.#startRefreshLoop(); }
    async refresh() { await Api.load(); this.#projects = Api.projects.map(project => new ProjectViewModel(project)); this.#carousel.stop(); this.#carousel.setProjects(this.#projects); if (this.#projects.length > 0) { this.#projectView.render(this.#projects[this.#carousel.currentIndex()] ?? this.#projects[0]); } }
    #startRefreshLoop() { setInterval(async () => { try { const current = this.#carousel.currentIndex(); await this.refresh(); this.#carousel.go(current); this.#carousel.start(8000); } catch (error) { console.error(error); } }, 60000); }
}
