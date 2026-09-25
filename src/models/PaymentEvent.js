const mongoose = require("mongoose");

const paymentEventSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            default: "razorpay"
        },
        eventId: {
            type: String,
            required: true,
            unique: true
        },
        eventType: {
            type: String,
            required: true
        },
        processedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("PaymentEvent", paymentEventSchema);