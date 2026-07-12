const Metric = require("./Metric");

class Project {

    constructor({
        name,
        logo = null,
        primary,
        metrics = []
    }) {

        this.name = name;

        this.logo = logo;

        this.primary = primary;

        this.metrics = [];

        metrics.forEach(metric => {

            this.addMetric(metric);

        });

    }

    addMetric(metric) {

        if (!(metric instanceof Metric)) {

            metric = new Metric(metric);

        }

        this.metrics.push(metric);

    }

    getMetric(type) {

        return this.metrics.find(metric => {

            return metric.type === type;

        });

    }

    hasMetric(type) {

        return this.getMetric(type) !== undefined;

    }

    removeMetric(type) {

        this.metrics = this.metrics.filter(metric => {

            return metric.type !== type;

        });

    }

    toJSON() {

        return {

            name: this.name,

            logo: this.logo,

            primary: this.primary,

            metrics: this.metrics.map(metric => {

                return metric.toJSON();

            })

        };

    }

}

module.exports = Project;