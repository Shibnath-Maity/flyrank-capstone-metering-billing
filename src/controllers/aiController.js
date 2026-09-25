const MeterService = require("../services/meterService");

const generateAI = async (req, res) => {
    try {
        const {
            tenantId,
            idempotencyKey,
            inputTokens = 0,
            cachedInputTokens = 0,
            outputTokens = 0,
            reasoningTokens = 0
        } = req.body;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: "tenantId is required"
            });
        }

        if (!idempotencyKey) {
            return res.status(400).json({
                success: false,
                message: "idempotencyKey is required"
            });
        }

        const quantity =
            inputTokens +
            cachedInputTokens +
            outputTokens +
            reasoningTokens;

        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "At least one token count must be greater than 0"
            });
        }

        const result = await MeterService.recordUsage({
            tenantId,
            type: "AI_TOKENS",
            quantity,
            idempotencyKey,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            reasoningTokens
        });

        return res.status(200).json({
            success: true,
            duplicate: !!result.duplicate,
            message: result.duplicate
                ? "Request already processed"
                : "AI usage recorded",
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
                message: "AI token quota exceeded"
            });
        }

        console.error("AI generation error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    generateAI
};