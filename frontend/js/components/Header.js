import Dom from '../utils/Dom.js';
import Formatter from '../utils/Formatter.js';
import Clock from './Clock.js';
export default class Header {
    #logo; #name; #handle; #networkIcon; #networkName; #clock;
    constructor() { this.#logo = Dom.id('projectLogo'); this.#name = Dom.id('projectName'); this.#handle = Dom.id('projectHandle'); this.#networkIcon = Dom.id('mainNetworkIcon'); this.#networkName = Dom.id('mainNetworkName'); this.#clock = new Clock(); }
    start() { this.#clock.start(); }
    render(project) { this.#renderLogo(project.logo); this.#renderName(project.name); this.#renderHandle(project.handle); this.#renderPrimary(project.network); }
    #renderLogo(logo) { this.#logo.src = logo; }
    #renderName(name) { this.#name.textContent = name; }
    #renderHandle(handle) { this.#handle.textContent = handle; }
    #renderPrimary(network) { this.#networkName.textContent = Formatter.capitalize(network); this.#networkIcon.src = `icons/${network}.svg`; this.#networkIcon.alt = network; }
    setOnline(online) { Dom.toggleClass(this.#networkIcon, 'offline', !online); }
}
