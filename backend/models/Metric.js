class Metric {

    constructor({
        type,
        label,
        value,
        logo = null,
        metadata = {}
    }) {

        this.type = type;

        this.label = label;

        this.value = value;

        this.logo = logo;

        this.metadata = metadata;

    }

    toJSON() {

        return {

            type: this.type,

            label: this.label,

            value: this.value,

            logo: this.logo,

            metadata: this.metadata

        };

    }

}

module.exports = Metric;