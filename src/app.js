const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const generateRoutes = require("./routes/generateRoutes");
const usageRoutes = require("./routes/usageRoutes");
const aiRoutes = require("./routes/aiRoutes");
const usageSummaryRoutes = require("./routes/usageSummaryRoutes");
const billingRoutes = require("./routes/billingRoutes");

const webhookRoutes = require("./routes/webhookRoutes");

const app = express();

app.use(
    helmet({
        // Fixes Razorpay Netbanking/UPI blank-popup issue.
        // Helmet v5+ sets Cross-Origin-Opener-Policy: same-origin by default,
        // which isolates the popup window Razorpay's checkout-frame.js opens
        // for Netbanking, so it can no longer write content into it.
        crossOriginOpenerPolicy: { policy: "unsafe-none" },

        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "https://checkout.razorpay.com",
                    "https://cdn.razorpay.com"
                ],

                frameSrc: [
                    "'self'",
                    "https://checkout.razorpay.com",
                    "https://api.razorpay.com"
                ],

                connectSrc: [
                    "'self'",
                    "https://api.razorpay.com",
                    "https://checkout.razorpay.com",
                    "https://cdn.razorpay.com"
                ],

                imgSrc: [
                    "'self'",
                    "data:",
                    "https:"
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'"
                ]
            }
        }
    })
);

app.use(cors());

app.use(express.static("public"));

/*
 * Razorpay webhook
 *
 * IMPORTANT:
 * The webhook must receive the raw request body
 * because Razorpay signature verification uses
 * the exact raw body.
 */
app.use(
    "/api/webhooks",
    express.raw({
        type: "application/json"
    }),
    webhookRoutes
);

// Normal JSON requests
app.use(express.json());

app.use(morgan("dev"));



app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Usage Metering & Billing Engine is running"
    });
});

app.use("/api", generateRoutes);
app.use("/api", usageRoutes);
app.use("/api", aiRoutes);
app.use("/api", usageSummaryRoutes);
app.use("/api", billingRoutes);

module.exports = app;