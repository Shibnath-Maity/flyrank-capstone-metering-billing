/**
 * @jest-environment node
 *
 * Razorpay webhook integration tests.
 */

require("dotenv").config();

const crypto = require("crypto");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/app");

const Tenant = require("../src/models/Tenant");
const Plan = require("../src/models/Plan");
const Subscription = require("../src/models/Subscription");
const PaymentEvent = require("../src/models/PaymentEvent");

const TEST_MONGO_URI =
    process.env.API_TEST_MONGO_URI ||
    "mongodb://127.0.0.1:27017/flyrank_metering_api_test";

let tenant;
let plan;

beforeAll(
    async () => {
        await mongoose.connect(TEST_MONGO_URI);
    },
    20000
);

afterAll(
    async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    },
    20000
);

beforeEach(
    async () => {
        await Promise.all([
            Tenant.deleteMany({}),
            Plan.deleteMany({}),
            Subscription.deleteMany({}),
            PaymentEvent.deleteMany({})
        ]);

        plan = await Plan.create({
            name: "WEBHOOK_TEST_PLAN",
            monthlyApiCalls: 10000,
            monthlyAiTokens: 1000000,
            priceInMinorUnits: 99900
        });

        tenant = await Tenant.create({
            name: "Webhook Test Tenant",
            email: `webhook-test-${Date.now()}@example.com`
        });
    }
);

function createSignature(rawBody) {
    return crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_WEBHOOK_SECRET
        )
        .update(rawBody)
        .digest("hex");
}

describe("Razorpay Webhooks", () => {

    test(
        "rejects webhook with invalid signature",
        async () => {
            const payload = JSON.stringify({
                event: "payment.captured"
            });

            const response = await request(app)
                .post("/api/webhooks/razorpay")
                .set(
                    "x-razorpay-signature",
                    "invalid-signature"
                )
                .set(
                    "x-razorpay-event-id",
                    `invalid-${Date.now()}`
                )
                .set(
                    "Content-Type",
                    "application/json"
                )
                .send(payload);

            expect(response.statusCode).toBe(400);

            expect(response.body.success).toBe(false);

            expect(response.body.message).toBe(
                "Invalid webhook signature"
            );
        }
    );

    test(
        "processes valid payment webhook and activates subscription",
        async () => {

            const orderId =
                `order_test_${Date.now()}`;

            const paymentId =
                `pay_test_${Date.now()}`;

            const eventId =
                `payment.captured_${paymentId}`;

            const payload = JSON.stringify({
                event: "payment.captured",

                payload: {
                    payment: {
                        entity: {
                            id: paymentId,
                            order_id: orderId
                        }
                    }
                }
            });

            // Mock Razorpay order lookup.
            const PaymentService =
                require("../src/services/paymentService");

            jest
                .spyOn(
                    PaymentService,
                    "getOrder"
                )
                .mockResolvedValue({
                    id: orderId,

                    notes: {
                        tenantId:
                            tenant._id.toString(),

                        planId:
                            plan._id.toString()
                    }
                });

            const signature =
                createSignature(payload);

            const response =
                await request(app)
                    .post(
                        "/api/webhooks/razorpay"
                    )
                    .set(
                        "x-razorpay-signature",
                        signature
                    )
                    .set(
                        "Content-Type",
                        "application/json"
                    )
                    .send(payload);

            expect(
                response.statusCode
            ).toBe(200);

            expect(
                response.body.success
            ).toBe(true);

            // Check subscription.
            const subscription =
                await Subscription.findOne({
                    tenantId: tenant._id
                });

            expect(
                subscription
            ).not.toBeNull();

            expect(
                subscription.status
            ).toBe("active");

            expect(
                subscription.planId.toString()
            ).toBe(
                plan._id.toString()
            );

            expect(
                subscription.provider
            ).toBe("razorpay");

            expect(
                subscription.providerSubscriptionId
            ).toBe(orderId);

            // Check PaymentEvent.
            const paymentEvent =
                await PaymentEvent.findOne({
                    provider: "razorpay",
                    eventId
                });

            expect(
                paymentEvent
            ).not.toBeNull();

            expect(
                paymentEvent.eventType
            ).toBe("payment.captured");

            PaymentService
                .getOrder
                .mockRestore();
        }
    );
    test("ignores duplicate webhook event", async () => {
    const orderId = `order_duplicate_${Date.now()}`;
    const paymentId = `pay_duplicate_${Date.now()}`;
    const eventId = `payment.captured_${paymentId}`;

    const payload = JSON.stringify({
        event: "payment.captured",
        payload: {
            payment: {
                entity: {
                    id: paymentId,
                    order_id: orderId
                }
            }
        }
    });

    const PaymentService =
        require("../src/services/paymentService");

    jest.spyOn(PaymentService, "getOrder")
        .mockResolvedValue({
            id: orderId,
            notes: {
                tenantId: tenant._id.toString(),
                planId: plan._id.toString()
            }
        });

    const signature = createSignature(payload);

    // First webhook
    const firstResponse = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", signature)
        .set("Content-Type", "application/json")
        .send(payload);

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body.success).toBe(true);

    // Same webhook again
    const secondResponse = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", signature)
        .set("Content-Type", "application/json")
        .send(payload);

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body.success).toBe(true);
    expect(secondResponse.body.duplicate).toBe(true);

    // Only one PaymentEvent should exist
    const paymentEvents = await PaymentEvent.find({
        provider: "razorpay",
        eventId
    });

    expect(paymentEvents.length).toBe(1);

    // Subscription should still be active
    const subscription = await Subscription.findOne({
        tenantId: tenant._id
    });

    expect(subscription).not.toBeNull();
    expect(subscription.status).toBe("active");
    expect(subscription.providerSubscriptionId).toBe(orderId);

    PaymentService.getOrder.mockRestore();
});
});