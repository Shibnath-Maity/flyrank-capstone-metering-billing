const UsageEvent = require("../models/UsageEvent");
const Subscription = require("../models/Subscription");

const getUsage = async (req, res) => {
    try {
        const { tenantId } = req.query;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: "tenantId is required"
            });
        }

        // Find active subscription
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

        // Calculate usage
        const usage = await UsageEvent.aggregate([
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
                    _id: "$type",
                    total: {
                        $sum: "$quantity"
                    }
                }
            }
        ]);

        let apiCalls = 0;
        let aiTokens = 0;

        usage.forEach((item) => {
            if (item._id === "API_CALL") {
                apiCalls = item.total;
            }

            if (item._id === "AI_TOKENS") {
                aiTokens = item.total;
            }
        });

        return res.status(200).json({
            success: true,
            tenantId,
            plan: subscription.planId.name,
            usage: {
                apiCalls,
                aiTokens
            },
            limits: {
                apiCalls: subscription.planId.monthlyApiCalls,
                aiTokens: subscription.planId.monthlyAiTokens
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    getUsage
};