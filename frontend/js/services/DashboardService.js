import Api from "./Api.js";
import ProjectManager from "../components/ProjectManager.js";

export default class DashboardService {

    #projectManager;

    constructor() {

        this.#projectManager = new ProjectManager();

    }

    async load() {

        await Api.load();

        this.#projectManager.load(
            Api.projects
        );

        return this.#projectManager;

    }

    async refresh() {

        const current =
            this.#projectManager.index();

        await Api.load();

        this.#projectManager.replace(
            Api.projects
        );

        if (
            current <
            this.#projectManager.count()
        ) {

            this.#projectManager.go(current);

        }

        return this.#projectManager;

    }

    current() {

        return this.#projectManager.current();

    }

    next() {

        return this.#projectManager.next();

    }

    previous() {

        return this.#projectManager.previous();

    }

    all() {

        return this.#projectManager.all();

    }

    count() {

        return this.#projectManager.count();

    }

}