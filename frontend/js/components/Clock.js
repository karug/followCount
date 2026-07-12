import Formatter from '../utils/Formatter.js';
import Dom from '../utils/Dom.js';
export default class Clock {
    #element; #timer;
    constructor(elementId = 'clock') { this.#element = Dom.id(elementId); }
    start() { this.stop(); this.#update(); this.#timer = setInterval(() => { this.#update(); }, 1000); }
    stop() { if (this.#timer) { clearInterval(this.#timer); this.#timer = null; } }
    refresh() { this.#update(); }
    #update() { this.#element.textContent = Formatter.time(); }
}
