export default class Formatter {

    static number(value, digits = 6) {

        const number = Number(value ?? 0);

        return number
            .toLocaleString(
                "en-US",
                {
                    useGrouping: false,
                    minimumIntegerDigits: digits
                }
            );

    }

    static compact(value) {

        const number = Number(value ?? 0);

        if (number >= 1000000000) {

            return (number / 1000000000).toFixed(1) + "B";

        }

        if (number >= 1000000) {

            return (number / 1000000).toFixed(1) + "M";

        }

        if (number >= 1000) {

            return (number / 1000).toFixed(1) + "K";

        }

        return number.toString();

    }

}