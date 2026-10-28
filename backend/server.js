// TODO: Delivery 2
require("dotenv").config();

const createApp = require("./app");
const DashboardService = require("./services/DashboardService");
const settings = require("./services/settings");
const MetaTokenService = require("./services/MetaTokenService");
const KioskMonitor = require("./services/KioskMonitor");
const SystemStatus = require("./services/SystemStatus");
const AlertService = require("./services/AlertService");

const PORT = process.env.PORT || 3000;

const metaTokens = new MetaTokenService({ settings });

const dashboardService = new DashboardService();

const kioskMonitor = new KioskMonitor(
    () => dashboardService.config ?? {}
);

const systemStatus = new SystemStatus();

const alertService = new AlertService({
    metaTokens,
    dashboard: dashboardService,
    system: systemStatus
});

/*
|--------------------------------------------------------------------------
| Startup
|--------------------------------------------------------------------------
*/

async function start() {

    try {

        settings.load();

        // Checks the real expiry of the Meta tokens once a day.
        metaTokens.start(24);

        await dashboardService.initialize();

        const app = createApp({
            settings,
            dashboardService,
            metaTokens,
            kioskMonitor,
            alertService,
            systemStatus
        });

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
