const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const PaymentService = require("../services/paymentService");

const createCheckout = async (req, res) => {
    try {
        const { tenantId } = req.body;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: "tenantId is required"
            });
        }

        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: "Tenant not found"
            });
        }

        const proPlan = await Plan.findOne({
            name: "Pro"
        });

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

        const receipt = `tenant_${tenantId}_${Date.now()}`;
const order = await PaymentService.createOrder({
    amountInMinorUnits: proPlan.priceInMinorUnits,
    receipt,
    notes: {
        tenantId: tenantId.toString(),
        planId: proPlan._id.toString()
    }
});
        
        return res.status(200).json({
            success: true,
            message: "Checkout order created",
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency
            },
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Checkout error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create checkout order"
        });
    }
};

module.exports = {
    createCheckout
};