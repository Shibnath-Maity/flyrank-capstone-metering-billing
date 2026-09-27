const UsageEvent = require("../models/UsageEvent");
const UsageCounter = require("../models/UsageCounter");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const CostService = require("./costService");

const USAGE_TYPE_FIELDS = {
    API_CALL: {
        limitField: "monthlyApiCalls",
        counterField: "apiCalls"
    },

    AI_TOKENS: {
        limitField: "monthlyAiTokens",
        counterField: "aiTokens"
    }
};

async function findExistingEvent(tenantId, idempotencyKey) {
    return UsageEvent.findOne({
        tenantId,
        idempotencyKey
    });
}

function getCurrentBillingMonth() {
    const now = new Date();

    return (
        `${now.getUTCFullYear()}-` +
        `${String(now.getUTCMonth() + 1).padStart(2, "0")}`
    );
}

class MeterService {
    static async recordUsage({
        tenantId,
        type,
        quantity,
        idempotencyKey,
        inputTokens = 0,
        cachedInputTokens = 0,
        outputTokens = 0,
        reasoningTokens = 0
    }) {
        // ------------------------------------------
        // 1. Validate input
        // ------------------------------------------

        const typeConfig = USAGE_TYPE_FIELDS[type];

        if (!typeConfig) {
            const error = new Error("Invalid usage type");
            error.code = "INVALID_USAGE_TYPE";
            error.statusCode = 400;
            throw error;
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            const error = new Error(
                "quantity must be a positive number"
            );

            error.code = "INVALID_QUANTITY";
            error.statusCode = 400;

            throw error;
        }

        const {
            limitField,
            counterField
        } = typeConfig;

        // ------------------------------------------
        // 2. Check idempotency first
        // ------------------------------------------

        const duplicateEvent = await findExistingEvent(
            tenantId,
            idempotencyKey
        );

        if (duplicateEvent) {
            return {
                duplicate: true,
                usageEvent: duplicateEvent
            };
        }

        // ------------------------------------------
        // 3. Find active subscription
        // ------------------------------------------

        const subscription = await Subscription.findOne({
            tenantId,
            status: "active"
        });

        if (!subscription) {
            const error = new Error("Payment required");

            error.code = "PAYMENT_REQUIRED";
            error.statusCode = 402;

            throw error;
        }

        // ------------------------------------------
        // 4. Find plan
        // ------------------------------------------

        const plan = await Plan.findById(
            subscription.planId
        );

        if (!plan) {
            const error = new Error("Plan not found");

            error.code = "PLAN_NOT_FOUND";
            error.statusCode = 500;

            throw error;
        }

        const limit = plan[limitField];

        if (!Number.isFinite(limit) || limit < 0) {
            const error = new Error(
                "Invalid plan quota"
            );

            error.code = "INVALID_PLAN_QUOTA";
            error.statusCode = 500;

            throw error;
        }

        // ------------------------------------------
        // 5. Current billing month
        // ------------------------------------------

        const month = getCurrentBillingMonth();

        // ------------------------------------------
        // 6. Ensure monthly counter exists
        //
        // This operation only creates the counter
        // when it does not already exist.
        // ------------------------------------------

        await UsageCounter.findOneAndUpdate(
            {
                tenantId,
                month
            },
            {
                $setOnInsert: {
                    tenantId,
                    month,
                    apiCalls: 0,
                    aiTokens: 0
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        // ------------------------------------------
        // 7. Atomically reserve quota
        //
        // The quota condition and increment happen
        // atomically on the same MongoDB document.
        // ------------------------------------------

        const counter =
            await UsageCounter.findOneAndUpdate(
                {
                    tenantId,
                    month,

                    $expr: {
                        $lte: [
                            {
                                $add: [
                                    `$${counterField}`,
                                    quantity
                                ]
                            },
                            limit
                        ]
                    }
                },
                {
                    $inc: {
                        [counterField]: quantity
                    }
                },
                {
                    new: true
                }
            );

        // ------------------------------------------
        // 8. Quota reservation failed
        //
        // Before returning 429, check whether another
        // concurrent request with the same idempotency
        // key already created the event.
        // ------------------------------------------

        if (!counter) {
            const concurrentEvent =
                await findExistingEvent(
                    tenantId,
                    idempotencyKey
                );

            if (concurrentEvent) {
                return {
                    duplicate: true,
                    usageEvent: concurrentEvent
                };
            }

            const error = new Error(
                "Usage quota exceeded"
            );

            error.code = "QUOTA_EXCEEDED";
            error.statusCode = 429;

            throw error;
        }

        // ------------------------------------------
        // 9. Calculate AI cost
        // ------------------------------------------

        let costInCents = 0;

        if (type === "AI_TOKENS") {
            costInCents =
                CostService.calculateAITokenCost({
                    inputTokens,
                    cachedInputTokens,
                    outputTokens,
                    reasoningTokens
                });
        }

        // ------------------------------------------
        // 10. Create detailed usage event
        // ------------------------------------------

        try {
            const usageEvent =
                await UsageEvent.create({
                    tenantId,
                    type,
                    quantity,
                    idempotencyKey,

                    inputTokens,
                    cachedInputTokens,
                    outputTokens,
                    reasoningTokens,

                    costInCents
                });

            return {
                duplicate: false,
                usageEvent
            };

        } catch (error) {

            // ------------------------------------------
            // 11. Duplicate idempotency request
            // ------------------------------------------

            if (error.code === 11000) {

                // Release the quota reservation because
                // another request already recorded this event.
                await UsageCounter.findOneAndUpdate(
                    {
                        tenantId,
                        month
                    },
                    {
                        $inc: {
                            [counterField]: -quantity
                        }
                    }
                );

                const existingEvent =
                    await findExistingEvent(
                        tenantId,
                        idempotencyKey
                    );

                return {
                    duplicate: true,
                    usageEvent: existingEvent
                };
            }

            // ------------------------------------------
            // 12. Roll back quota for other failures
            // ------------------------------------------

            await UsageCounter.findOneAndUpdate(
                {
                    tenantId,
                    month
                },
                {
                    $inc: {
                        [counterField]: -quantity
                    }
                }
            );

            throw error;
        }
    }
}

module.exports = MeterService;