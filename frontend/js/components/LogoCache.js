export default class LogoCache {
    static #cache = new Map();
    static async get(url) { if (!url) return 'assets/project-placeholder.svg'; if (this.#cache.has(url)) return this.#cache.get(url); try { const response = await fetch(url); if (!response.ok) throw new Error(); const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); this.#cache.set(url, objectUrl); return objectUrl; } catch { return 'assets/project-placeholder.svg'; } }
    static clear() { this.#cache.forEach(url => { URL.revokeObjectURL(url); }); this.#cache.clear(); }
}
