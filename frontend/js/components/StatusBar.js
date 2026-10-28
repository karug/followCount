import Clock from './Clock.js';
import WifiIndicator from './WifiIndicator.js';
import Dom from '../utils/Dom.js';
export default class StatusBar {
    #clock; #wifi; #alert;
    constructor() { this.#clock = new Clock(); this.#wifi = new WifiIndicator(); this.#alert = Dom.id('alertIcon'); }
    start() { this.#clock.start(); this.#wifi.start(); }
    stop() { this.#clock.stop(); }
    setAlerts(alerts) { const list = Array.isArray(alerts) ? alerts : []; this.#alert.hidden = list.length === 0; this.#alert.title = list.map(alert => alert?.code ?? alert).join(', '); }
    get online() { return this.#wifi.isOnline(); }
}
