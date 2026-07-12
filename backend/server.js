// TODO: Delivery 2
require("dotenv").config();
const express = require("express");
const path = require("path");

const DashboardService = require("./services/DashboardService");

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
app.use(
    "/cache",
    express.static(
        path.join(__dirname, "cache")
    )
);

app.use(
    express.static(
        path.join(__dirname, "../frontend")
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
        timestamp: new Date().toISOString()
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