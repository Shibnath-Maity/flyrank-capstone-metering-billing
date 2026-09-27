const mongoose = require("mongoose");

const monthlyUsageSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        month: {
            type: String,
            required: true
        },

        apiCalls: {
            type: Number,
            default: 0
        },

        aiTokens: {
            type: Number,
            default: 0
        },

        aiCostInCents: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

monthlyUsageSchema.index(
    { tenantId: 1, month: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    "MonthlyUsage",
    monthlyUsageSchema
);