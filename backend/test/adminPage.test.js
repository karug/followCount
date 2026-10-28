const test = require("node:test");
const assert = require("node:assert");

const { startServer } = require("../testing/server");

for (const route of ["/admin", "/admin/"]) {

    test(`GET ${route} sirve la interfaz del panel`, async () => {

        const server = await startServer();

        try {

            const response = await fetch(`${server.url}${route}`);

            assert.strictEqual(response.status, 200);

            assert.match(response.headers.get("content-type"), /text\/html/);

            const html = await response.text();

            assert.match(html, /\/admin\/admin\.js/);

        } finally {

            await server.close();

        }

    });

}

test("los recursos del panel se sirven con rutas absolutas", async () => {

    const server = await startServer();

    try {

        for (const asset of ["/admin/admin.css", "/admin/admin.js"]) {

            const response = await fetch(`${server.url}${asset}`);

            assert.strictEqual(response.status, 200);

        }

    } finally {

        await server.close();

    }

});
