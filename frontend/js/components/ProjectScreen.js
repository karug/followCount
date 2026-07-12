import Dom from '../utils/Dom.js';
import Formatter from '../utils/Formatter.js';
import FlipCounter from './FlipCounter.js';
import SocialCard from './SocialCard.js';

export default class ProjectScreen {

    #element;

    #logo;

    #name;

    #handle;

    #networkIcon;

    #networkName;

    #counter;

    #cardsContainer;

    constructor(project) {

        this.#element = this.#build();

        this.update(project);

    }

    get element() {

        return this.#element;

    }

    update(project) {

        this.#logo.src = project.logo;

        this.#name.textContent = project.name;

        this.#handle.textContent = project.handle;

        this.#networkIcon.src =
            `icons/${project.network}.svg`;

        this.#networkIcon.alt = project.network;

        this.#networkName.textContent =
            Formatter.capitalize(project.network);

        this.#counter.render(project.counter);

        this.#renderCards(project.cards);

    }

    /**
     * Decode every image before the screen slides in, so the
     * transition never shows half-loaded logos. Capped so a slow
     * CDN cannot stall the carousel.
     */
    async preload(timeoutMs = 600) {

        const images = [
            ...this.#element.querySelectorAll('img')
        ];

        const decoded = Promise.allSettled(

            images.map(image =>

                image.decode
                    ? image.decode().catch(() => {})
                    : Promise.resolve()

            )

        );

        await Promise.race([

            decoded,

            new Promise(resolve =>
                setTimeout(resolve, timeoutMs)
            )

        ]);

    }

    #build() {

        const screen = Dom.element(
            'section',
            ['screen']
        );

        screen.appendChild(this.#buildHeader());

        screen.appendChild(this.#buildCounterCard());

        this.#cardsContainer = Dom.element(
            'section',
            ['social-cards']
        );

        screen.appendChild(this.#cardsContainer);

        return screen;

    }

    #buildHeader() {

        const header = Dom.element(
            'header',
            ['screen-header']
        );

        this.#logo = Dom.image(
            'assets/project-placeholder.png',
            'Project Logo',
            ['project-logo']
        );

        const titles = Dom.element('div');

        this.#name = Dom.text(
            'div',
            '',
            ['project-name']
        );

        this.#handle = Dom.text(
            'div',
            '',
            ['project-handle']
        );

        Dom.append(titles, this.#name, this.#handle);

        Dom.append(header, this.#logo, titles);

        return header;

    }

    #buildCounterCard() {

        const card = Dom.element(
            'section',
            ['main-counter-card']
        );

        const network = Dom.element(
            'div',
            ['networkHeader']
        );

        this.#networkIcon = Dom.image(
            '',
            '',
            ['network-icon']
        );

        this.#networkName = Dom.text(
            'span',
            '',
            ['network-name']
        );

        Dom.append(
            network,
            this.#networkIcon,
            this.#networkName
        );

        const counterContainer = Dom.element('div');

        this.#counter = new FlipCounter(counterContainer);

        Dom.append(card, network, counterContainer);

        return card;

    }

    #renderCards(cards) {

        Dom.clear(this.#cardsContainer);

        cards.forEach(metric => {

            const card = new SocialCard(metric);

            this.#cardsContainer.appendChild(
                card.element
            );

        });

    }

}
