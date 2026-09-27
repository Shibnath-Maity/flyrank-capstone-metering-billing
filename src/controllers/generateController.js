const MeterService = require("../services/meterService");

const generate = async (req, res) => {
    try {
        // Tenant comes from the authenticated API key.
        const tenantId = req.tenantId;

        const { idempotencyKey } = req.body;

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                message: "Tenant authentication required"
            });
        }

        if (!idempotencyKey) {
            return res.status(400).json({
                success: false,
                message: "idempotencyKey is required"
            });
        }

        const result = await MeterService.recordUsage({
            tenantId,
            type: "API_CALL",
            quantity: 1,
            idempotencyKey
        });

        return res.status(200).json({
            success: true,
            duplicate: !!result.duplicate,
            message: result.duplicate
                ? "Request already processed"
                : "Generation successful",
            usageEvent: result.usageEvent
        });

    } catch (error) {
        if (error.code === "PAYMENT_REQUIRED") {
            return res.status(402).json({
                success: false,
                message: "Payment required. Please subscribe to a plan."
            });
        }

        if (error.code === "QUOTA_EXCEEDED") {
            return res.status(429).json({
                success: false,
                message: "Usage quota exceeded"
            });
        }

        console.error("Generate error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    generate
};