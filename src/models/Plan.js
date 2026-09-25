const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true
        },
        monthlyApiCalls: {
            type: Number,
            required: true
        },
        monthlyAiTokens: {
            type: Number,
            required: true
        },
        priceInMinorUnits: {
            type: Number,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);