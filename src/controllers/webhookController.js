const PaymentEvent = require("../models/PaymentEvent");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");
const razorpay = require("../config/razorpay");

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
        const eventId =
            req.headers["x-razorpay-event-id"] ||
            payload?.payload?.payment?.entity?.id;

        const eventType = payload.event;


        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: "Webhook event ID missing"
            });
        }


        // 5. Check duplicate webhook
        const existingEvent =
            await PaymentEvent.findOne({
                eventId
            });


        if (existingEvent) {

            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Webhook already processed"
            });

        }


        // 6. Save webhook event
        await PaymentEvent.create({
            provider: "razorpay",
            eventId,
            eventType
        });


        // 7. Process successful payment
        if (
            eventType === "payment.captured" ||
            eventType === "order.paid"
        ) {

            const payment =
                payload?.payload?.payment?.entity;

            const orderId =
                payment?.order_id;


            if (orderId) {

                console.log(
                    `Payment successful for order ${orderId}`
                );


                // 8. Fetch order from Razorpay
                const order =
                    await razorpay.orders.fetch(orderId);


                // 9. Get tenant and plan from order notes
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


                // 10. Find subscription
                const subscription =
                    await Subscription.findOne({
                        tenantId,
                        status: "active"
                    });


                if (!subscription) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Active subscription not found"
                    });

                }


                // 11. Find plan
                const plan =
                    await Plan.findById(planId);


                if (!plan) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Plan not found"
                    });

                }


                // 12. Upgrade subscription
                subscription.planId =
                    plan._id;

                subscription.provider =
                    "razorpay";

                subscription.providerSubscriptionId =
                    orderId;


                await subscription.save();


                console.log(
                    `Tenant ${tenantId} upgraded to ${plan.name}`
                );

            }

        }


        // 13. Success response
        return res.status(200).json({
            success: true,
            message: "Webhook processed"
        });


    } catch (error) {

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