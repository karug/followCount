// TODO: Delivery 2
require("dotenv").config();
const express = require("express");
const path = require("path");

const DashboardService = require("./services/DashboardService");
const InstagramTokenService = require("./services/InstagramTokenService");

const app = express();

const PORT = process.env.PORT || 3000;

const dashboardService = new DashboardService();

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.disable("x-powered-by");

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

/*
|--------------------------------------------------------------------------
| Static frontend
|--------------------------------------------------------------------------
*/
// Only cache/logos/ is public. Never widen this to the whole
// cache/ directory: state/ (tokens, cached metrics) lives outside
// it specifically so this route can't reach it, but scoping the
// mount narrowly is a second line of defense against anything
// else ending up under cache/ by mistake.
app.use(
    "/cache/logos",
    express.static(
        path.join(__dirname, "cache", "logos")
    )
);

app.use(
    express.static(
        path.join(__dirname, "../frontend"),
        {
            // Kiosk browsers must revalidate assets on reload so
            // icon/JS updates reach the screen.
            maxAge: 0,
            etag: true
        }
    )
);

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {

    res.json({
        status: "UP",
        timestamp: new Date().toISOString(),
        instagramToken: InstagramTokenService.status()
    });

});

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

app.get("/api/dashboard", async (req, res) => {

    try {

        const dashboard =
            await dashboardService.build();

        res.set("Cache-Control", "no-store");

        res.json(dashboard);

    } catch (error) {

        console.error(error);

        res.status(500).json({

            error: true,

            message: "Unable to generate dashboard."

        });

    }

});

/*
|--------------------------------------------------------------------------
| SPA
|--------------------------------------------------------------------------
*/

app.get("*", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "../frontend/index.html"
        )
    );

});

/*
|--------------------------------------------------------------------------
| Startup
|--------------------------------------------------------------------------
*/

async function start() {

    try {

        InstagramTokenService.load();

        // Refreshes the token every 48h so a 60-day expiry is
        // never reached; a hard invalidation (password change,
        // logout elsewhere) still needs a manual new token.
        InstagramTokenService.start(48);

        await dashboardService.initialize();

        app.listen(PORT, () => {

            console.log("");
            console.log("========================================");
            console.log(" followCount Backend");
            console.log("========================================");
            console.log(` http://localhost:${PORT}`);
            console.log("========================================");
            console.log("");

        });

    } catch (error) {

        console.error(error);

        process.exit(1);

    }

}

start();