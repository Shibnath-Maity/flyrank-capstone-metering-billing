require("dotenv").config();

const mongoose = require("mongoose");
const crypto = require("crypto");

const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const ApiKey = require("../models/ApiKey");
const UsageEvent = require("../models/UsageEvent");
const UsageCounter = require("../models/UsageCounter");
const MonthlyUsage = require("../models/MonthlyUsage");
const PaymentEvent = require("../models/PaymentEvent");

const connectDB = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
};

const seedDatabase = async () => {
    try {
        await connectDB();

        // Clear old data
        await PaymentEvent.deleteMany({});
        await MonthlyUsage.deleteMany({});
        await UsageCounter.deleteMany({});
        await UsageEvent.deleteMany({});
        await ApiKey.deleteMany({});
        await Subscription.deleteMany({});
        await Tenant.deleteMany({});
        await Plan.deleteMany({});

        // Create plans
        const freePlan = await Plan.create({
            name: "Free",
            monthlyApiCalls: 2,
            monthlyAiTokens: 100000,
            priceInMinorUnits: 0
        });

        const proPlan = await Plan.create({
            name: "Pro",
            monthlyApiCalls: 10000,
            monthlyAiTokens: 1000000,
            priceInMinorUnits: 99900
        });

        // Create test tenant
        const tenant = await Tenant.create({
            name: "Demo Company",
            email: "demo@example.com"
        });

        // Create API key for the NEW tenant
        const apiKey = await ApiKey.create({
            key: `demo_${crypto.randomBytes(24).toString("hex")}`,
            tenantId: tenant._id,
            active: true
        });

        // Give tenant Free plan
        await Subscription.create({
            tenantId: tenant._id,
            planId: freePlan._id,
            status: "active",
            provider: "razorpay"
        });

        console.log("Database seeded successfully");

        console.log("Free Plan:", freePlan._id);
        console.log("Pro Plan:", proPlan._id);
        console.log("Tenant:", tenant._id);
        console.log("API Key:", apiKey.key);

        await mongoose.connection.close();
    } catch (error) {
        console.error("Seeding failed:", error.message);

        await mongoose.connection.close();
        process.exit(1);
    }
};

seedDatabase();