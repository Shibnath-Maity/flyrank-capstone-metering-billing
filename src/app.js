const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const generateRoutes = require("./routes/generateRoutes");
const usageRoutes = require("./routes/usageRoutes");
const aiRoutes = require("./routes/aiRoutes");
const usageSummaryRoutes = require("./routes/usageSummaryRoutes");
const billingRoutes = require("./routes/billingRoutes");
const testPaymentRoutes = require("./routes/testPaymentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");

const app = express();
app.use(
    helmet({
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

app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

app.use(morgan("dev"));
app.use("/api", testPaymentRoutes);
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