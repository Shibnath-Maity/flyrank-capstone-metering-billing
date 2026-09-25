const UsageEvent = require("../models/UsageEvent");
const UsageCounter = require("../models/UsageCounter");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const CostService = require("./costService");

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
        // 1. Check idempotency first
        // ------------------------------------------
        const existingEvent = await UsageEvent.findOne({
            tenantId,
            idempotencyKey
        });

        if (existingEvent) {
            return {
                duplicate: true,
                usageEvent: existingEvent
            };
        }

        // ------------------------------------------
        // 2. Find active subscription
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
        // 3. Find plan
        // ------------------------------------------
        const plan = await Plan.findById(subscription.planId);

        if (!plan) {
            throw new Error("Plan not found");
        }

        // ------------------------------------------
        // 4. Validate usage type
        // ------------------------------------------
        let limitField;
        let counterField;

        if (type === "API_CALL") {
            limitField = "monthlyApiCalls";
            counterField = "apiCalls";
        } else if (type === "AI_TOKENS") {
            limitField = "monthlyAiTokens";
            counterField = "aiTokens";
        } else {
            throw new Error("Invalid usage type");
        }

        const limit = plan[limitField];

        // ------------------------------------------
        // 5. Current billing month
        // ------------------------------------------
        const now = new Date();

        const month =
            `${now.getUTCFullYear()}-` +
            `${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

        // ------------------------------------------
        // 6a. Ensure the monthly UsageCounter exists
        //
        // This upsert has NO quota logic in its filter -
        // it only ever matches on { tenantId, month }, so
        // it is always safe to upsert. $setOnInsert only
        // applies when a new document is actually created,
        // so an existing counter is left untouched.
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
        // 6b. Atomically reserve quota
        //
        // The counter document is now guaranteed to exist
        // (from 6a), so this query can safely omit upsert.
        // Do NOT add upsert here - combining upsert with an
        // $expr quota-check filter is unsafe, since a
        // non-matching filter (quota exceeded) combined with
        // no existing document would cause Mongo to create a
        // new, incorrect document instead of returning null.
        // ------------------------------------------
        const counter = await UsageCounter.findOneAndUpdate(
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
        // 7. If quota could not be reserved
        // ------------------------------------------
      
// 7. If quota could not be reserved,
// check whether another concurrent request with the
// same idempotency key already completed the request.
if (!counter) {
    const existingEvent = await UsageEvent.findOne({
        tenantId,
        idempotencyKey
    });

    if (existingEvent) {
        return {
            duplicate: true,
            usageEvent: existingEvent
        };
    }

    const error = new Error("Usage quota exceeded");
    error.code = "QUOTA_EXCEEDED";
    error.statusCode = 429;
    throw error;
}
        // ------------------------------------------
        // 8. Calculate AI cost
        // ------------------------------------------
        let costInCents = 0;

        if (type === "AI_TOKENS") {
            costInCents = CostService.calculateAITokenCost({
                inputTokens,
                cachedInputTokens,
                outputTokens,
                reasoningTokens
            });
        }

        // ------------------------------------------
        // 9. Create detailed usage event
        // ------------------------------------------
        try {
            const usageEvent = await UsageEvent.create({
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

            // Duplicate idempotency request
            if (error.code === 11000) {

                // IMPORTANT:
                // Release the quota reservation because
                // this request was already processed.
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

                const existingEvent = await UsageEvent.findOne({
                    tenantId,
                    idempotencyKey
                });

                return {
                    duplicate: true,
                    usageEvent: existingEvent
                };
            }

            // If event creation failed for another reason,
            // release the reserved quota.
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