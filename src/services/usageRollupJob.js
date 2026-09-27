const cron = require("node-cron");
const UsageCounter = require("../models/UsageCounter");

function startUsageRollupJob() {
    // Runs at 00:05 on the 1st day of every month
    cron.schedule("5 0 1 * *", async () => {
        try {
            console.log("Running monthly usage rollup...");

            const previousDate = new Date();
            previousDate.setUTCMonth(
                previousDate.getUTCMonth() - 1
            );

            const month =
                `${previousDate.getUTCFullYear()}-` +
                `${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;

            const counters = await UsageCounter.find({
                month
            });

            console.log(
                `Monthly usage rollup completed for ${month}.`
            );

            console.log(
                `Tenants processed: ${counters.length}`
            );

        } catch (error) {
            console.error(
                "Monthly usage rollup failed:",
                error.message
            );
        }
    });

    console.log("Monthly usage rollup job started.");
}

module.exports = startUsageRollupJob;