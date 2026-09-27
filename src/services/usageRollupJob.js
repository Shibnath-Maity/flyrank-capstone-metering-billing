const cron = require("node-cron");

const UsageEvent = require("../models/UsageEvent");
const MonthlyUsage = require("../models/MonthlyUsage");


async function runMonthlyUsageRollup(targetMonth) {
    try {
        console.log("Running monthly usage rollup...");

        let targetDate;

        // Manual testing
        if (targetMonth) {
            const [year, monthNumber] = targetMonth
                .split("-")
                .map(Number);

            targetDate = new Date(
                Date.UTC(year, monthNumber - 1, 1)
            );
        } else {
            // Previous completed month
            targetDate = new Date();

            targetDate.setUTCDate(1);
            targetDate.setUTCMonth(
                targetDate.getUTCMonth() - 1
            );
        }


        const month =
            `${targetDate.getUTCFullYear()}-` +
            `${String(
                targetDate.getUTCMonth() + 1
            ).padStart(2, "0")}`;


        const startOfMonth = new Date(
            Date.UTC(
                targetDate.getUTCFullYear(),
                targetDate.getUTCMonth(),
                1
            )
        );

        const startOfNextMonth = new Date(
            Date.UTC(
                targetDate.getUTCFullYear(),
                targetDate.getUTCMonth() + 1,
                1
            )
        );


        // UsageEvent is the source of truth for monthly billing.
        const summaries = await UsageEvent.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startOfMonth,
                        $lt: startOfNextMonth
                    }
                }
            },
            {
                $group: {
                    _id: "$tenantId",

                    apiCalls: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$type",
                                        "API_CALL"
                                    ]
                                },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    aiTokens: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$type",
                                        "AI_TOKENS"
                                    ]
                                },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    aiCostInCents: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$type",
                                        "AI_TOKENS"
                                    ]
                                },
                                "$costInCents",
                                0
                            ]
                        }
                    }
                }
            }
        ]);


        if (summaries.length === 0) {
            console.log(
                `No usage events found for ${month}.`
            );

            return;
        }


        const bulkOps = summaries.map(summary => ({
            updateOne: {
                filter: {
                    tenantId: summary._id,
                    month
                },

                update: {
                    $set: {
                        tenantId: summary._id,
                        month,
                        apiCalls: summary.apiCalls,
                        aiTokens: summary.aiTokens,
                        aiCostInCents:
                            summary.aiCostInCents
                    }
                },

                upsert: true
            }
        }));


        await MonthlyUsage.bulkWrite(bulkOps);


        console.log(
            `Monthly usage rollup completed for ${month}.`
        );

        console.log(
            `Tenants processed: ${summaries.length}`
        );

    } catch (error) {

        console.error(
            "Monthly usage rollup failed:",
            error.stack || error.message
        );
    }
}


function startUsageRollupJob() {

    // Runs at 00:05 UTC on the 1st day of every month
    cron.schedule(
        "5 0 1 * *",
        () => runMonthlyUsageRollup(),
        {
            timezone: "UTC"
        }
    );

    console.log(
        "Monthly usage rollup job started."
    );
}


module.exports = startUsageRollupJob;

module.exports.runMonthlyUsageRollup =
    runMonthlyUsageRollup;