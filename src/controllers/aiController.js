const MeterService = require("../services/meterService");

const generateAI = async (req, res) => {
    try {
        // Tenant comes from the authenticated API key.
        const tenantId = req.tenantId;

        const {
            idempotencyKey,
            inputTokens = 0,
            cachedInputTokens = 0,
            outputTokens = 0,
            reasoningTokens = 0
        } = req.body;

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

        const totalTokens =
            Number(inputTokens) +
            Number(cachedInputTokens) +
            Number(outputTokens) +
            Number(reasoningTokens);

        if (totalTokens <= 0) {
            return res.status(400).json({
                success: false,
                message: "At least one token count is required"
            });
        }

        const result = await MeterService.recordUsage({
            tenantId,
            type: "AI_TOKENS",
            quantity: totalTokens,
            idempotencyKey,
            inputTokens: Number(inputTokens),
            cachedInputTokens: Number(cachedInputTokens),
            outputTokens: Number(outputTokens),
            reasoningTokens: Number(reasoningTokens)
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