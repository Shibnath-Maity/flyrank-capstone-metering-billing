/**
 * @jest-environment node
 *
 * API integration tests for Usage Metering & Billing.
 *
 * These tests use a dedicated MongoDB database so they do not
 * interfere with development data or the race-condition tests.
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
const ApiKey = require("../src/models/ApiKey");

const TEST_MONGO_URI =
    process.env.API_TEST_MONGO_URI ||
    "mongodb://127.0.0.1:27017/flyrank_metering_api_test";

let tenant;
let plan;
let apiKey;

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
        UsageCounter.deleteMany({}),
        ApiKey.deleteMany({})
    ]);

    // Create a Free plan.
    plan = await Plan.create({
        name: "FREE_TEST_PLAN",
        monthlyApiCalls: 1000,
        monthlyAiTokens: 100000,
        priceInMinorUnits: 0
    });

    // Create primary test tenant.
    tenant = await Tenant.create({
        name: "API Test Tenant",
        email: `api-test-${Date.now()}@example.com`
    });

    // Give the primary tenant an active subscription.
    await Subscription.create({
        tenantId: tenant._id,
        planId: plan._id,
        status: "active",
        provider: "razorpay",
        providerSubscriptionId: `sub-api-${Date.now()}`
    });

    // Create API key for the primary tenant.
    apiKey = await ApiKey.create({
        key: `test-api-key-${Date.now()}-${Math.random()}`,
        tenantId: tenant._id,
        active: true
    });
});

describe("API Usage Metering", () => {

    test(
        "returns 402 when tenant has no active subscription",
        async () => {
            // Remove the active subscription.
            await Subscription.deleteMany({
                tenantId: tenant._id
            });

            const response = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey: `no-sub-${Date.now()}`
                });

            expect(response.statusCode).toBe(402);
            expect(response.body.success).toBe(false);
        }
    );

    test(
        "records API usage successfully",
        async () => {
            const response = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey: `api-success-${Date.now()}`
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.duplicate).toBe(false);

            expect(
                response.body.usageEvent.tenantId.toString()
            ).toBe(tenant._id.toString());

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
            const idempotencyKey =
                `duplicate-${Date.now()}`;

            const payload = {
                idempotencyKey
            };

            const firstResponse = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send(payload);

            const secondResponse = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send(payload);

            expect(firstResponse.statusCode).toBe(200);
            expect(secondResponse.statusCode).toBe(200);

            expect(
                firstResponse.body.duplicate
            ).toBe(false);

            expect(
                secondResponse.body.duplicate
            ).toBe(true);

            const eventCount =
                await UsageEvent.countDocuments({
                    tenantId: tenant._id,
                    idempotencyKey
                });

            expect(eventCount).toBe(1);

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
            // Create a small-quota plan.
            const quotaPlan = await Plan.create({
                name: "API_QUOTA_TEST_PLAN",
                monthlyApiCalls: 2,
                monthlyAiTokens: 100000,
                priceInMinorUnits: 0
            });

            // Replace the current subscription's plan.
            await Subscription.updateOne(
                {
                    tenantId: tenant._id,
                    status: "active"
                },
                {
                    planId: quotaPlan._id
                }
            );

            const first = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey: `quota-1-${Date.now()}`
                });

            const second = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey: `quota-2-${Date.now()}`
                });

            const third = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey: `quota-3-${Date.now()}`
                });

            expect(first.statusCode).toBe(200);
            expect(second.statusCode).toBe(200);

            expect(third.statusCode).toBe(429);
            expect(third.body.success).toBe(false);

            const counter =
                await UsageCounter.findOne({
                    tenantId: tenant._id
                });

            expect(counter.apiCalls).toBe(2);
        }
    );

    test(
        "records AI token usage successfully",
        async () => {
            const response = await request(app)
                .post("/api/ai/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey:
                        `ai-success-${Date.now()}`,
                    inputTokens: 1000,
                    cachedInputTokens: 0,
                    outputTokens: 1000,
                    reasoningTokens: 0
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

            expect(
                response.body.usageEvent.inputTokens
            ).toBe(1000);

            expect(
                response.body.usageEvent.outputTokens
            ).toBe(1000);
        }
    );

    test(
        "returns 429 when AI token quota is exceeded",
        async () => {
            const quotaPlan = await Plan.create({
                name: "AI_QUOTA_TEST_PLAN",
                monthlyApiCalls: 1000,
                monthlyAiTokens: 2000,
                priceInMinorUnits: 0
            });

            await Subscription.updateOne(
                {
                    tenantId: tenant._id,
                    status: "active"
                },
                {
                    planId: quotaPlan._id
                }
            );

            const first = await request(app)
                .post("/api/ai/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey:
                        `ai-quota-1-${Date.now()}`,
                    inputTokens: 1000,
                    outputTokens: 1000
                });

            const second = await request(app)
                .post("/api/ai/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    idempotencyKey:
                        `ai-quota-2-${Date.now()}`,
                    inputTokens: 1000,
                    outputTokens: 1000
                });

            expect(first.statusCode).toBe(200);

            expect(second.statusCode).toBe(429);
            expect(second.body.success).toBe(false);

            const counter =
                await UsageCounter.findOne({
                    tenantId: tenant._id
                });

            expect(counter.aiTokens).toBe(2000);
        }
    );

    test(
        "API key isolates tenant from tenantId supplied in request body",
        async () => {
            // Create a second tenant.
            const tenantB = await Tenant.create({
                name: "Tenant B",
                email: `tenant-b-${Date.now()}@example.com`
            });

            // Give Tenant B an active subscription.
            await Subscription.create({
                tenantId: tenantB._id,
                planId: plan._id,
                status: "active",
                provider: "razorpay",
                providerSubscriptionId:
                    `sub-tenant-b-${Date.now()}`
            });

            // Tenant A's API key is used.
            // The request will deliberately try to specify
            // Tenant B's ID in the request body.
            const response = await request(app)
                .post("/api/generate")
                .set("X-API-Key", apiKey.key)
                .send({
                    tenantId: tenantB._id.toString(),
                    idempotencyKey:
                        `cross-tenant-${Date.now()}`
                });

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);

            // The event must belong to Tenant A,
            // because the API key belongs to Tenant A.
            expect(
                response.body.usageEvent.tenantId.toString()
            ).toBe(tenant._id.toString());

            expect(
                response.body.usageEvent.tenantId.toString()
            ).not.toBe(tenantB._id.toString());

            // Verify database ownership.
            const tenantAEvents =
                await UsageEvent.countDocuments({
                    tenantId: tenant._id
                });

            const tenantBEvents =
                await UsageEvent.countDocuments({
                    tenantId: tenantB._id
                });

            expect(tenantAEvents).toBe(1);
            expect(tenantBEvents).toBe(0);
        }
    );
});