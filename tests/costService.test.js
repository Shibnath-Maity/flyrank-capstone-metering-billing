const CostService = require("../src/services/costService");

describe("AI Cost Service", () => {

    test("calculates AI token cost correctly", () => {

        const cost = CostService.calculateAITokenCost({
            inputTokens: 1000000,
            cachedInputTokens: 1000000,
            outputTokens: 1000000,
            reasoningTokens: 1000000
        });

        expect(cost).toBe(725);
    });

    test("reasoning tokens are billed as output", () => {

        const cost = CostService.calculateAITokenCost({
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 1000000
        });

        expect(cost).toBe(300);
    });

    test("cached input is cheaper than normal input", () => {

        const normalInput = CostService.calculateAITokenCost({
            inputTokens: 1000000
        });

        const cachedInput = CostService.calculateAITokenCost({
            cachedInputTokens: 1000000
        });

        expect(cachedInput).toBeLessThan(normalInput);
    });

});