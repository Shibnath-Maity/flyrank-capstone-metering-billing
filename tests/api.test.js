/**
 * @jest-environment node
 *
 * API integration tests for Usage Metering.
 *
 * Tests:
 * 1. 402 when there is no active subscription
 * 2. Successful API usage recording
 * 3. Idempotency prevents duplicate usage
 * 4. API quota returns 429
 * 5. Successful AI token usage recording
 * 6. AI token quota returns 429
 */

require("dotenv").config();

const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/app");

const Tenant = require("../src/models/Tenant");
const Plan = require("../src/models/Plan");
const Subscription = require("../src/models/Subscription");
const UsageEvent = require("../src/models/UsageEvent");
const UsageCounter = require("../src/models/UsageCounter");

const TEST_MONGO_URI =
    process.env.TEST_MONGO_URI ||
    "mongodb://127.0.0.1:27017/flyrank_metering_test";

beforeAll(async () => {
    await mongoose.connect(TEST_MONGO_URI);
}, 20000);

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
}, 20000);

beforeEach(async () => {
    await Promise.all([
        Tenant.deleteMany({}),
        Plan.deleteMany({}),
        Subscription.deleteMany({}),
        UsageEvent.deleteMany({}),
        UsageCounter.deleteMany({})
    ]);
});

async function createTenantWithPlan({
    apiLimit = 100,
    aiTokenLimit = 10000,
    withSubscription = true
} = {}) {
    const plan = await Plan.create({
        name: `Test Plan ${Date.now()}-${Math.random()}`,
        monthlyApiCalls: apiLimit,
        monthlyAiTokens: aiTokenLimit,
        priceInMinorUnits: 0
    });

    const tenant = await Tenant.create({
        name: "API Test Tenant",
        email: `test-${Date.now()}-${Math.random()}@example.com`
    });

    if (withSubscription) {
        await Subscription.create({
            tenantId: tenant._id,
            planId: plan._id,
            status: "active",
            provider: "razorpay"
        });
    }

    return {
        tenant,
        plan
    };
}

describe("API Usage Metering", () => {

    test(
        "returns 402 when tenant has no active subscription",
        async () => {
            const { tenant } = await createTenantWithPlan({
                withSubscription: false
            });

            const response = await request(app)
                .post("/api/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "payment-required-test"
                });

            expect(response.statusCode).toBe(402);
            expect(response.body.success).toBe(false);
        }
    );


    test(
        "records API usage successfully",
        async () => {
            const { tenant } =
                await createTenantWithPlan();

            const response = await request(app)
                .post("/api/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "api-success-test"
                });

            expect(response.statusCode).toBe(200);

            expect(response.body.success).toBe(true);

            expect(response.body.duplicate).toBe(false);

            expect(
                response.body.usageEvent.type
            ).toBe("API_CALL");

            expect(
                response.body.usageEvent.quantity
            ).toBe(1);
        }
    );


    test(
        "same idempotency key does not create duplicate usage",
        async () => {
            const { tenant } =
                await createTenantWithPlan();

            const payload = {
                tenantId: tenant._id.toString(),
                idempotencyKey: "same-key-test"
            };

            const firstResponse = await request(app)
                .post("/api/generate")
                .send(payload);

            const secondResponse = await request(app)
                .post("/api/generate")
                .send(payload);

            expect(firstResponse.statusCode).toBe(200);
            expect(secondResponse.statusCode).toBe(200);

            expect(
                firstResponse.body.duplicate
            ).toBe(false);

            expect(
                secondResponse.body.duplicate
            ).toBe(true);

            const events = await UsageEvent.find({
                tenantId: tenant._id
            });

            expect(events).toHaveLength(1);

            const counter =
                await UsageCounter.findOne({
                    tenantId: tenant._id
                });

            expect(counter.apiCalls).toBe(1);
        }
    );


    test(
        "returns 429 when API quota is exceeded",
        async () => {
            const { tenant } =
                await createTenantWithPlan({
                    apiLimit: 2
                });

            const first = await request(app)
                .post("/api/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "quota-api-1"
                });

            const second = await request(app)
                .post("/api/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "quota-api-2"
                });

            const third = await request(app)
                .post("/api/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "quota-api-3"
                });

            expect(first.statusCode).toBe(200);

            expect(second.statusCode).toBe(200);

            expect(third.statusCode).toBe(429);

            expect(third.body.success).toBe(false);
        }
    );


    test(
        "records AI token usage successfully",
        async () => {
            const { tenant } =
                await createTenantWithPlan();

            const response = await request(app)
                .post("/api/ai/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "ai-success-test",

                    inputTokens: 1000,
                    cachedInputTokens: 500,
                    outputTokens: 400,
                    reasoningTokens: 100
                });

            expect(response.statusCode).toBe(200);

            expect(response.body.success).toBe(true);

            expect(response.body.duplicate).toBe(false);

            expect(
                response.body.usageEvent.type
            ).toBe("AI_TOKENS");

            expect(
                response.body.usageEvent.quantity
            ).toBe(2000);
        }
    );


    test(
        "returns 429 when AI token quota is exceeded",
        async () => {
            const { tenant } =
                await createTenantWithPlan({
                    aiTokenLimit: 1000
                });

            const response = await request(app)
                .post("/api/ai/generate")
                .send({
                    tenantId: tenant._id.toString(),
                    idempotencyKey: "ai-quota-test",

                    inputTokens: 600,
                    cachedInputTokens: 0,
                    outputTokens: 400,
                    reasoningTokens: 100
                });

            expect(response.statusCode).toBe(429);

            expect(response.body.success).toBe(false);
        }
    );

});