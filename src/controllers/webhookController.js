const PaymentEvent = require("../models/PaymentEvent");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");

const PaymentService = require("../services/paymentService");

const {
    verifyRazorpaySignature
} = require("../services/webhookService");

const handleRazorpayWebhook = async (req, res) => {
    try {
        // 1. Get Razorpay signature
        const signature =
            req.headers["x-razorpay-signature"];

        if (!signature) {
            return res.status(400).json({
                success: false,
                message: "Missing Razorpay signature"
            });
        }

        // 2. Verify webhook signature
        const isValid = verifyRazorpaySignature(
            req.body,
            signature
        );

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature"
            });
        }

        // 3. Convert raw body to JSON
        const payload =
            JSON.parse(req.body.toString());

        // 4. Get event information
        const eventType = payload.event;

        const paymentEntityId =
            payload?.payload?.payment?.entity?.id;

        // Combine event type with the payment entity id so distinct
        // event types (e.g. "payment.captured" vs "order.paid") for the
        // same payment aren't treated as duplicates of each other.
        const eventId = paymentEntityId
            ? `${eventType}_${paymentEntityId}`
            : req.headers["x-razorpay-event-id"];

        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: "Webhook event ID missing"
            });
        }

        // 5. Check duplicate webhook
        const existingEvent =
            await PaymentEvent.findOne({
                provider: "razorpay",
                eventId
            });

        if (existingEvent) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Webhook already processed"
            });
        }

        // 6. Process successful payment
        if (
            eventType === "payment.captured" ||
            eventType === "order.paid"
        ) {
            const payment =
                payload?.payload?.payment?.entity;

            const orderId =
                payment?.order_id;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: "Order ID missing from payment"
                });
            }

            console.log(
                `Payment successful for order ${orderId}`
            );

            // 7. Fetch Razorpay order
            const order =
                await PaymentService.getOrder(orderId);

            // 8. Get tenant and plan from order notes
            const tenantId =
                order.notes?.tenantId;

            const planId =
                order.notes?.planId;

            if (!tenantId || !planId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Tenant information missing from order"
                });
            }

            // 9. Find plan
            const plan =
                await Plan.findById(planId);

            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: "Plan not found"
                });
            }

            // 10. Create or activate subscription
            const subscription =
                await Subscription.findOneAndUpdate(
                    {
                        tenantId
                    },
                    {
                        tenantId,
                        planId: plan._id,
                        status: "active",
                        provider: "razorpay",
                        providerSubscriptionId: orderId
                    },
                    {
                        upsert: true,
                        new: true
                    }
                );

            console.log(
                `Tenant ${tenantId} subscribed to ${plan.name}`
            );

            console.log(
                `Subscription ${subscription._id} activated`
            );
        }

        // 11. Save webhook event
        await PaymentEvent.create({
            provider: "razorpay",
            eventId,
            eventType,
            processedAt: new Date()
        });

        // 12. Success response
        return res.status(200).json({
            success: true,
            message: "Webhook processed"
        });

    } catch (error) {

        // Concurrent duplicate webhook
        if (error.code === 11000) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Webhook already processed"
            });
        }

        console.error(
            "Webhook error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Webhook processing failed"
        });
    }
};

module.exports = {
    handleRazorpayWebhook
};