const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },

        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Plan",
            required: true
        },

        status: {
            type: String,
            enum: ["active", "cancelled", "past_due"],
            default: "active"
        },

        provider: {
            type: String,
            enum: ["razorpay"],
            default: "razorpay"
        },

        providerSubscriptionId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);