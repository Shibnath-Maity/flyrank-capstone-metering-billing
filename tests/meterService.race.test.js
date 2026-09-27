/**
 * @jest-environment node
 *
 * Race-safety tests for MeterService.
 *
 * These tests fire concurrent recordUsage() calls directly against
 * MeterService (bypassing HTTP) to prove:
 *
 *   1. A tenant can never be granted more usage than its plan quota,
 *      even when many requests race each other.
 *   2. The same idempotencyKey sent concurrently produces exactly
 *      ONE UsageEvent and the counter reflects only one reservation.
 *   3. A UsageCounter document is created on-demand for a tenant's
 *      first request in a month.
 *
 * NOTE:
 * This test suite uses its own dedicated MongoDB database so it
 * cannot interfere with the API test suite or development database.
 */

const mongoose = require("mongoose");

const Tenant = require("../src/models/Tenant");
const Plan = require("../src/models/Plan");
const Subscription = require("../src/models/Subscription");
const UsageEvent = require("../src/models/UsageEvent");
const UsageCounter = require("../src/models/UsageCounter");
const MeterService = require("../src/services/meterService");

// Dedicated database for race-condition tests.
// This is intentionally different from the API test database.
const TEST_MONGO_URI =
    process.env.RACE_TEST_MONGO_URI ||
    "mongodb://127.0.0.1:27017/flyrank_metering_race_test";

let tenant;
let plan;

const QUOTA = 10;

beforeAll(async () => {
    await mongoose.connect(TEST_MONGO_URI);
}, 20000);

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
}, 20000);

beforeEach(async () => {
    // Clean slate for every test.
    await Promise.all([
        Tenant.deleteMany({}),
        Plan.deleteMany({}),
        Subscription.deleteMany({}),
        UsageEvent.deleteMany({}),
        UsageCounter.deleteMany({})
    ]);

    // Create test tenant.
    tenant = await Tenant.create({
        name: "Race Test Tenant",
        email: `race-${Date.now()}@example.com`
    });

    // Create test plan with a small quota.
    plan = await Plan.create({
        name: "RACE_TEST_PLAN",
        monthlyApiCalls: QUOTA,
        monthlyAiTokens: QUOTA,
        priceInMinorUnits: 0
    });

    // Give the tenant an active subscription.
    await Subscription.create({
        tenantId: tenant._id,
        planId: plan._id,
        status: "active",
        provider: "razorpay",
        providerSubscriptionId: `sub_race_${Date.now()}`
    });
});

describe("MeterService — counter creation on first use", () => {
    test(
        "creates a UsageCounter on-demand for a tenant's first request in a month",
        async () => {
            const before = await UsageCounter.findOne({
                tenantId: tenant._id
            });

            expect(before).toBeNull();

            const result = await MeterService.recordUsage({
                tenantId: tenant._id,
                type: "API_CALL",
                quantity: 1,
                idempotencyKey: "first-request-key"
            });

            expect(result.duplicate).toBe(false);

            const after = await UsageCounter.findOne({
                tenantId: tenant._id
            });

            expect(after).not.toBeNull();
            expect(after.apiCalls).toBe(1);
        }
    );
});

describe("MeterService — quota cannot be exceeded under concurrency", () => {
    test(
        "N concurrent requests against a quota of N: exactly N succeed, the rest get 429",
        async () => {
            const CONCURRENCY = QUOTA * 2;

            const requests = Array.from(
                { length: CONCURRENCY },
                (_, i) =>
                    MeterService.recordUsage({
                        tenantId: tenant._id,
                        type: "API_CALL",
                        quantity: 1,
                        idempotencyKey: `race-key-${i}`
                    }).then(
                        (res) => ({
                            ok: true,
                            res
                        }),
                        (err) => ({
                            ok: false,
                            err
                        })
                    )
            );

            const settled = await Promise.all(requests);

            const succeeded = settled.filter(
                (r) => r.ok
            );

            const rejected = settled.filter(
                (r) => !r.ok
            );

            // Exactly QUOTA requests should succeed.
            expect(succeeded.length).toBe(QUOTA);

            // Remaining requests should be rejected.
            expect(rejected.length).toBe(
                CONCURRENCY - QUOTA
            );

            // Every rejected request must be a quota error.
            for (const r of rejected) {
                expect(r.err.statusCode).toBe(429);
                expect(r.err.code).toBe(
                    "QUOTA_EXCEEDED"
                );
            }

            // Counter must never exceed the quota.
            const counter = await UsageCounter.findOne({
                tenantId: tenant._id
            });

            expect(counter).not.toBeNull();
            expect(counter.apiCalls).toBe(QUOTA);

            // Exactly QUOTA usage events should be persisted.
            const eventCount =
                await UsageEvent.countDocuments({
                    tenantId: tenant._id
                });

            expect(eventCount).toBe(QUOTA);
        }
    );

    test(
        "same idempotencyKey sent concurrently produces exactly one UsageEvent",
        async () => {
            const CONCURRENCY = 15;
            const sharedKey = "duplicate-race-key";

            const requests = Array.from(
                { length: CONCURRENCY },
                () =>
                    MeterService.recordUsage({
                        tenantId: tenant._id,
                        type: "API_CALL",
                        quantity: 1,
                        idempotencyKey: sharedKey
                    }).then(
                        (res) => ({
                            ok: true,
                            res
                        }),
                        (err) => ({
                            ok: false,
                            err
                        })
                    )
            );

            const settled = await Promise.all(
                requests
            );

            // All requests represent the same
            // idempotent operation.
            // None should receive an error.
            const failed = settled.filter(
                (r) => !r.ok
            );

            expect(failed.length).toBe(0);

            // Exactly one request creates the event.
            const originals = settled.filter(
                (r) =>
                    r.ok &&
                    r.res.duplicate === false
            );

            // All remaining requests should be duplicates.
            const duplicates = settled.filter(
                (r) =>
                    r.ok &&
                    r.res.duplicate === true
            );

            expect(originals.length).toBe(1);

            expect(duplicates.length).toBe(
                CONCURRENCY - 1
            );

            // Exactly one UsageEvent should exist.
            const eventCount =
                await UsageEvent.countDocuments({
                    tenantId: tenant._id,
                    idempotencyKey: sharedKey
                });

            expect(eventCount).toBe(1);

            // Counter must reflect only ONE reservation.
            const counter =
                await UsageCounter.findOne({
                    tenantId: tenant._id
                });

            expect(counter).not.toBeNull();
            expect(counter.apiCalls).toBe(1);
        }
    );
});

describe(
    "MeterService — AI token quota respects same race-safety",
    () => {
        test(
            "AI_TOKENS quota is race-safe the same way API_CALL is",
            async () => {
                const CONCURRENCY = QUOTA * 2;

                const requests = Array.from(
                    { length: CONCURRENCY },
                    (_, i) =>
                        MeterService.recordUsage({
                            tenantId: tenant._id,
                            type: "AI_TOKENS",
                            quantity: 1,
                            idempotencyKey:
                                `ai-race-key-${i}`,
                            inputTokens: 1,
                            outputTokens: 0
                        }).then(
                            (res) => ({
                                ok: true,
                                res
                            }),
                            (err) => ({
                                ok: false,
                                err
                            })
                        )
                );

                const settled = await Promise.all(
                    requests
                );

                const succeeded =
                    settled.filter(
                        (r) => r.ok
                    );

                const rejected =
                    settled.filter(
                        (r) => !r.ok
                    );

                // Exactly QUOTA AI token requests
                // should succeed.
                expect(succeeded.length).toBe(
                    QUOTA
                );

                // Remaining requests should fail.
                expect(rejected.length).toBe(
                    CONCURRENCY - QUOTA
                );

                // Every rejected request should be
                // a quota error.
                for (const r of rejected) {
                    expect(r.err.statusCode).toBe(
                        429
                    );

                    expect(r.err.code).toBe(
                        "QUOTA_EXCEEDED"
                    );
                }

                const counter =
                    await UsageCounter.findOne({
                        tenantId: tenant._id
                    });

                expect(counter).not.toBeNull();

                expect(counter.aiTokens).toBe(
                    QUOTA
                );

                // Exactly QUOTA AI usage events.
                const eventCount =
                    await UsageEvent.countDocuments({
                        tenantId: tenant._id,
                        type: "AI_TOKENS"
                    });

                expect(eventCount).toBe(QUOTA);
            }
        );
    }
);