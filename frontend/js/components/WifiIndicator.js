import Dom from '../utils/Dom.js';
export default class WifiIndicator {
    #element; #online = true;
    constructor(elementId = 'wifiIcon') { this.#element = Dom.id(elementId); this.#listen(); }
    start() { this.#update(); }
    isOnline() { return this.#online; }
    #listen() { window.addEventListener('online', () => { this.#online = true; this.#update(); }); window.addEventListener('offline', () => { this.#online = false; this.#update(); }); }
    #update() { Dom.toggleClass(this.#element, 'offline', !this.#online); this.#element.title = this.#online ? 'Online' : 'Offline'; }
}
