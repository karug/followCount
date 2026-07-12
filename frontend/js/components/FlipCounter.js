import Dom from '../utils/Dom.js';
import Formatter from '../utils/Formatter.js';

export default class FlipCounter {

    #container;
    #digits = [];
    #value = '';

    constructor(container) {

        this.#container = container;
        this.#container.classList.add('flip-counter');

    }

    render(value) {

        const chars = Formatter.number(value).split('');

        if (this.#digits.length !== chars.length) {

            this.#rebuild(chars);
            this.#value = chars.join('');

            return;

        }

        chars.forEach((char, index) => {

            const digit = this.#digits[index];

            if (digit.dataset.value !== char) {

                this.#animate(digit, char);

            }

        });

        this.#value = chars.join('');

    }

    clear() {

        Dom.clear(this.#container);

        this.#digits = [];

        this.#value = '';

    }

    #rebuild(chars) {

        this.clear();

        chars.forEach(char => {

            const digit = this.#createDigit(char);

            this.#digits.push(digit);

            this.#container.appendChild(digit);

        });

    }

    #createDigit(value) {

        if (value === '.') {

            const separator = Dom.element(
                'div',
                ['flip-separator']
            );

            separator.textContent = '.';

            separator.dataset.value = '.';

            return separator;

        }

        const digit = Dom.element(
            'div',
            ['flip-digit']
        );

        digit.dataset.value = value;

        digit.textContent = value;

        return digit;

    }

    #animate(digit, newValue) {

        if (digit.classList.contains('flip-separator')) {

            return;

        }

        digit.animate([

            {

                transform: 'translateY(-10px)',

                opacity: .2

            },

            {

                transform: 'translateY(0)',

                opacity: 1

            }

        ], {

            duration: 180,

            easing: 'ease-out'

        });

        digit.textContent = newValue;

        digit.dataset.value = newValue;

    }

    setValue(value) {

        this.render(value);

    }

    getValue() {

        return this.#value;

    }

}