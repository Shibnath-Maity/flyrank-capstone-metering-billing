const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const PaymentEvent = require("../models/PaymentEvent");

const simulatePayment = async (req, res) => {
    try {
        // Safety: never allow this in production
        if (process.env.NODE_ENV === "production") {
            return res.status(403).json({
                success: false,
                message: "Test payment disabled in production"
            });
        }

        const { tenantId } = req.body;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: "tenantId is required"
            });
        }

        const proPlan = await Plan.findOne({ name: "Pro" });

        if (!proPlan) {
            return res.status(404).json({
                success: false,
                message: "Pro plan not found"
            });
        }

        const subscription = await Subscription.findOne({
            tenantId,
            status: "active"
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Active subscription not found"
            });
        }

        const eventId = `test_payment_${tenantId}_${Date.now()}`;

        await PaymentEvent.create({
            provider: "test",
            eventId,
            eventType: "payment.captured"
        });

        subscription.planId = proPlan._id;
        subscription.provider = "razorpay";
        subscription.providerSubscriptionId = `test_order_${Date.now()}`;

        await subscription.save();

        return res.status(200).json({
            success: true,
            message: "Demo payment successful",
            payment: {
                mode: "TEST",
                amount: proPlan.priceInMinorUnits,
                currency: "INR"
            },
            subscription: {
                plan: proPlan.name,
                status: subscription.status
            }
        });

    } catch (error) {
        console.error("Demo payment error:", error);

        return res.status(500).json({
            success: false,
            message: "Demo payment failed"
        });
    }
};

module.exports = { simulatePayment };