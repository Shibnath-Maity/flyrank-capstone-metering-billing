const UsageEvent = require("../models/UsageEvent");
const Subscription = require("../models/Subscription");

const getUsageSummary = async (req, res) => {
    try {
        // Tenant comes from authenticated API key
        const tenantId = req.tenantId;

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                message: "Tenant authentication required"
            });
        }

        // Find active subscription and plan
        const subscription = await Subscription.findOne({
            tenantId,
            status: "active"
        }).populate("planId");

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "No active subscription found"
            });
        }

        // Start of current month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Calculate monthly totals
        const summary = await UsageEvent.aggregate([
            {
                $match: {
                    tenantId: subscription.tenantId,
                    createdAt: {
                        $gte: startOfMonth
                    }
                }
            },
            {
                $group: {
                    _id: null,

                    apiCalls: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "API_CALL"] },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    aiTokens: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "AI_TOKENS"] },
                                "$quantity",
                                0
                            ]
                        }
                    },

                    aiCostInCents: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "AI_TOKENS"] },
                                "$costInCents",
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const result = summary.length > 0
            ? summary[0]
            : {
                apiCalls: 0,
                aiTokens: 0,
                aiCostInCents: 0
            };

        return res.status(200).json({
            success: true,

            month: `${startOfMonth.getFullYear()}-${String(
                startOfMonth.getMonth() + 1
            ).padStart(2, "0")}`,

            plan: subscription.planId.name,

            usage: {
                apiCalls: result.apiCalls,
                aiTokens: result.aiTokens
            },

            limits: {
                apiCalls: subscription.planId.monthlyApiCalls,
                aiTokens: subscription.planId.monthlyAiTokens
            },

            cost: {
                aiCostInCents: result.aiCostInCents
            }
        });

    } catch (error) {
        console.error("Usage summary error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    getUsageSummary
};