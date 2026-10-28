const express = require("express");
const path = require("path");

const AdminAuth = require("./services/AdminAuth");
const SystemActions = require("./services/SystemActions");
const createAdminRouter = require("./routes/admin");

function createApp({
    settings,
    dashboardService,
    metaTokens,
    kioskMonitor,
    alertService,
    systemStatus,
    systemActions = new SystemActions(),
    now = Date.now
}) {

    const app = express();

    const auth = new AdminAuth({ settings, now });

    /*
    |--------------------------------------------------------------------------
    | Middleware
    |--------------------------------------------------------------------------
    */

    app.disable("x-powered-by");

    app.use(express.json({ limit: "100kb" }));

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
            metaTokens: metaTokens.status(),
            kiosk: kioskMonitor.status()
        });

    });

    /*
    |--------------------------------------------------------------------------
    | Kiosk heartbeat
    |--------------------------------------------------------------------------
    */

    app.post("/api/heartbeat", (req, res) => {

        kioskMonitor.record(req.body);

        res.sendStatus(204);

    });

    app.get("/api/kiosk", (req, res) => {

        res.set("Cache-Control", "no-store");

        res.json(kioskMonitor.status());

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

            // Computed on every request, never stored in the dashboard
            // cache. A failure here must not take the dashboard down.
            let alerts = [];

            try {

                alerts = await alertService.codes();

            } catch (error) {

                console.error(error);

            }

            res.set("Cache-Control", "no-store");

            res.json({
                ...dashboard,
                alerts
            });

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
    | Admin
    |--------------------------------------------------------------------------
    */

    app.use("/api/admin", createAdminRouter({
        settings,
        auth,
        dashboardService,
        metaTokens,
        kioskMonitor,
        alertService,
        systemStatus,
        systemActions
    }));

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

    return app;

}

module.exports = createApp;
