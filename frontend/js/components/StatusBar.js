import Clock from './Clock.js';
import WifiIndicator from './WifiIndicator.js';
export default class StatusBar {
    #clock; #wifi;
    constructor() { this.#clock = new Clock(); this.#wifi = new WifiIndicator(); }
    start() { this.#clock.start(); this.#wifi.start(); }
    stop() { this.#clock.stop(); }
    get online() { return this.#wifi.isOnline(); }
}
