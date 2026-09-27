const mongoose = require("mongoose");

const usageEventSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: ["API_CALL", "AI_TOKENS"],
            required: true
        },

        quantity: {
            type: Number,
            required: true,
            min: 1
        },

        idempotencyKey: {
            type: String,
            required: true
        },

        inputTokens: {
            type: Number,
            default: 0
        },

        cachedInputTokens: {
            type: Number,
            default: 0
        },

        outputTokens: {
            type: Number,
            default: 0
        },

        reasoningTokens: {
            type: Number,
            default: 0
        },

        costInCents: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

// Ensures the same idempotency key cannot be
// recorded twice for the same tenant.
usageEventSchema.index(
    {
        tenantId: 1,
        idempotencyKey: 1
    },
    {
        unique: true
    }
);

// Optimizes monthly usage rollup queries
// based on createdAt and tenant.
usageEventSchema.index({
    createdAt: 1,
    tenantId: 1,
    type: 1
});

module.exports = mongoose.model("UsageEvent", usageEventSchema);