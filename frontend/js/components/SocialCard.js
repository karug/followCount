import Dom from '../utils/Dom.js';
import Formatter from '../utils/Formatter.js';

export default class SocialCard {

    #metric;

    #element;

    #value;

    #title;

    #icon;

    constructor(metric) {

        this.#metric = metric;

        this.#element = this.#build();

    }

    get element() {

        return this.#element;

    }

    update(metric) {

        this.#metric = metric;

        this.#title.textContent =
            Formatter.capitalize(metric.type);

        this.#value.textContent =
            Formatter.compact(metric.value);

        this.#icon.src =
            `icons/${metric.type}.svg`;

        this.#icon.alt =
            metric.type;

        this.#element.className =
            `social-card ${metric.type}`;

    }

    #build() {

        const card = Dom.element(
            'div',
            ['social-card', this.#metric.type]
        );

        card.dataset.type =
            this.#metric.type;

        Dom.append(

            card,

            this.#buildHeader(),

            this.#buildBody()

        );

        return card;

    }

    #buildHeader() {

        const header = Dom.element(
            'div',
            ['social-header']
        );

        this.#icon = Dom.image(

            `icons/${this.#metric.type}.svg`,

            this.#metric.type,

            ['social-icon']

        );

        this.#title = Dom.text(

            'div',

            Formatter.capitalize(
                this.#metric.type
            ),

            ['social-name']

        );

        Dom.append(

            header,

            this.#icon,

            this.#title

        );

        return header;

    }

    #buildBody() {

        const body = Dom.element(
            'div',
            ['social-body']
        );

        this.#value = Dom.text(

            'div',

            Formatter.compact(
                this.#metric.value
            ),

            ['social-value']

        );

        body.appendChild(
            this.#value
        );

        return body;

    }

}