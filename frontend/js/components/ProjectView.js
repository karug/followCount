import Header from './Header.js';
import FlipCounter from './FlipCounter.js';
import SocialCard from './SocialCard.js';
import Dom from '../utils/Dom.js';

export default class ProjectView {

    #header;

    #counter;

    #cardsContainer;

    constructor() {

        this.#header = new Header();

        this.#counter = new FlipCounter(
            Dom.id('flipCounter')
        );

        this.#cardsContainer =
            Dom.id('socialCards');

    }

    start() {

        this.#header.start();

    }

    render(project) {

        this.#header.render(project);

        this.#counter.render(
            project.counter
        );

        this.#renderCards(
            project.cards
        );

    }

    clear() {

        this.#counter.clear();

        Dom.clear(
            this.#cardsContainer
        );

    }

    #renderCards(cards) {

        Dom.clear(
            this.#cardsContainer
        );

        cards.forEach(metric => {

            const card =
                new SocialCard(metric);

            this.#cardsContainer.appendChild(
                card.element
            );

        });

    }

}