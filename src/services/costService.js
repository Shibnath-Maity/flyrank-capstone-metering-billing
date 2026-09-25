const { AI_PRICING } = require("../config/pricingConfig");

class CostService {

    static calculateAITokenCost({
        inputTokens = 0,
        cachedInputTokens = 0,
        outputTokens = 0,
        reasoningTokens = 0
    }) {

        // Reasoning tokens are billed as output tokens
        const billableOutputTokens =
            outputTokens + reasoningTokens;

        const inputCost =
            (inputTokens / 1_000_000) *
            AI_PRICING.inputPerMillionTokensCents;

        const cachedInputCost =
            (cachedInputTokens / 1_000_000) *
            AI_PRICING.cachedInputPerMillionTokensCents;

        const outputCost =
            (billableOutputTokens / 1_000_000) *
            AI_PRICING.outputPerMillionTokensCents;

        const totalCost =
            inputCost +
            cachedInputCost +
            outputCost;

        return Math.round(totalCost);
    }
}

module.exports = CostService;