const mongoose = require("mongoose");

const usageCounterSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true
        },

        month: {
            type: String,
            required: true
        },

        apiCalls: {
            type: Number,
            default: 0,
            min: 0
        },

        aiTokens: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    { timestamps: true }
);

usageCounterSchema.index(
    { tenantId: 1, month: 1 },
    { unique: true }
);

module.exports = mongoose.model("UsageCounter", usageCounterSchema);