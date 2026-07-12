import Dom from '../utils/Dom.js';
export default class Carousel {
    #projects = []; #index = 0; #interval = null; #delay = 8000; #container; #callback = null;
    constructor(containerId = 'carouselDots') { this.#container = Dom.id(containerId); }
    setProjects(projects) { this.#projects = projects ?? []; this.#index = 0; this.#render(); }
    onChange(callback) { this.#callback = callback; }
    start(delay = 8000) { this.stop(); this.#delay = delay; if (this.#projects.length <= 1) return; this.#interval = setInterval(() => { this.next(); }, this.#delay); }
    stop() { if (this.#interval) { clearInterval(this.#interval); this.#interval = null; } }
    next() { if (this.#projects.length === 0) return; this.#index++; if (this.#index >= this.#projects.length) this.#index = 0; this.#render(); this.#notify(); }
    previous() { if (this.#projects.length === 0) return; this.#index--; if (this.#index < 0) this.#index = this.#projects.length - 1; this.#render(); this.#notify(); }
    go(index) { if (index < 0 || index >= this.#projects.length) return; this.#index = index; this.#render(); this.#notify(); }
    current() { return this.#projects[this.#index]; }
    currentIndex() { return this.#index; }
    #notify() { if (this.#callback) this.#callback(this.current(), this.#index); }
    #render() { Dom.clear(this.#container); this.#projects.forEach((project, index) => { const dot = Dom.element('span'); if (index === this.#index) dot.classList.add('active'); Dom.on(dot, 'click', () => { this.go(index); }); this.#container.appendChild(dot); }); }
}
