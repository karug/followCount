export default class Dom {
    static create(tag) { return document.createElement(tag); }
    static element(tag, classes = []) { const element = document.createElement(tag); if (Array.isArray(classes)) element.classList.add(...classes); return element; }
    static text(tag, text, classes = []) { const element = Dom.element(tag, classes); element.textContent = text; return element; }
    static image(src, alt = '', classes = []) { const image = document.createElement('img'); image.src = src; image.alt = alt; if (Array.isArray(classes)) image.classList.add(...classes); return image; }
    static append(parent, ...children) { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; }
    static clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    static id(id) { return document.getElementById(id); }
    static query(selector) { return document.querySelector(selector); }
    static queryAll(selector) { return [...document.querySelectorAll(selector)]; }
    static addClass(element, className) { element.classList.add(className); }
    static removeClass(element, className) { element.classList.remove(className); }
    static toggleClass(element, className, enabled = true) { element.classList.toggle(className, enabled); }
    static data(element, key, value) { element.dataset[key] = value; }
    static attr(element, name, value) { element.setAttribute(name, value); }
    static on(element, event, callback) { element.addEventListener(event, callback); }
}
