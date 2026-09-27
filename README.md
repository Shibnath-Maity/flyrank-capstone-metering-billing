
# Usage Metering & Billing Engine

A backend service for tracking API usage and AI token consumption, enforcing monthly quotas, calculating AI usage costs, and handling subscription payments.

This project was developed as the **Backend AI Engineering Capstone for FlyRank**.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Usage Metering](#usage-metering)
- [Idempotency](#idempotency)
- [Quota Enforcement](#quota-enforcement)
- [AI Token Pricing](#ai-token-pricing)
- [Payment Flow](#payment-flow)
- [Webhook Handling](#webhook-handling)
- [Monthly Usage Rollup](#monthly-usage-rollup)
- [Error Handling](#error-handling)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Running the Project](#running-the-project)
- [Testing](#testing)
- [Security](#security)
- [Database Indexes](#database-indexes)
- [Design Decisions](#design-decisions)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Example API Flows](#example-api-flows)
- [NPM Scripts](#npm-scripts)
- [Implementation Status](#implementation-status)
- [Author](#author)

---

# Overview

The **Usage Metering & Billing Engine** provides backend infrastructure for SaaS applications that need to:

- Track API requests
- Track AI token consumption
- Enforce monthly usage limits
- Prevent duplicate billing using idempotency keys
- Calculate AI usage costs
- Handle payment checkout
- Process payment webhooks
- Activate subscriptions
- Generate monthly usage summaries
- Roll up historical usage
- Maintain tenant-level isolation

The system is designed around a multi-tenant architecture where each API key belongs to a specific tenant.

---

# Features

## Usage Metering

The system supports two usage types:

- `API_CALL`
- `AI_TOKENS`

Each usage event is associated with:

- Tenant
- Usage type
- Quantity
- Idempotency key
- Token breakdown where applicable
- Calculated cost
- Timestamp

---

## Idempotency

Usage requests support idempotency keys to prevent duplicate usage recording.

A unique compound index is created on:

```text
tenantId + idempotencyKey
````

If the same request is retried after the original request has already been processed, the existing usage event is returned instead of charging usage again.

---

## Atomic Quota Enforcement

Monthly usage limits are enforced using an atomic MongoDB update.

The system checks whether:

```text
current usage + requested usage <= monthly limit
```

before incrementing the usage counter.

If the quota would be exceeded, the request receives:

```http
429 Too Many Requests
```

---

## Payment Required

Usage requires an active subscription.

If a tenant does not have an active subscription, the system returns:

```http
402 Payment Required
```

---

## AI Token Metering

The system supports:

* Input tokens
* Cached input tokens
* Output tokens
* Reasoning tokens

Reasoning tokens are counted as output tokens for pricing purposes.

---

## AI Cost Calculation

AI costs are calculated using integer currency units rather than floating-point money values.

The current pricing configuration is stored in:

```text
src/config/pricingConfig.js
```

Example pricing structure:

```javascript
const AI_PRICING = {
    inputPerMillionTokensCents: 100,
    cachedInputPerMillionTokensCents: 25,
    outputPerMillionTokensCents: 300
};
```

---

## Razorpay Payment Integration

The project uses Razorpay Test Mode for payment processing.

The payment layer uses a provider abstraction:

```text
PaymentService
      ↓
PaymentProvider
      ↓
RazorpayProvider
      ↓
Razorpay API
```

This allows another payment provider to be added later without changing the business logic significantly.

---

## Payment Webhooks

Razorpay webhook requests are verified using an HMAC SHA-256 signature.

The system also prevents duplicate webhook processing using payment event records.

---

## Monthly Usage Summary

Tenants can retrieve their current monthly:

* API calls
* AI tokens
* Plan limits
* AI cost

---

## Monthly Usage Rollup

A background job aggregates historical usage events into the `MonthlyUsage` collection.

The rollup uses `UsageEvent` as the source of truth.

The scheduled job runs monthly using `node-cron`.

---

# Architecture

```text
                         ┌─────────────────────┐
                         │      Client         │
                         │                     │
                         │ API Key + Requests  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Express API     │
                         └──────────┬──────────┘
                                    │
                   ┌────────────────┼────────────────┐
                   │                │                │
                   ▼                ▼                ▼
             Authentication    Controllers       Webhooks
                   │                │                │
                   │                ▼                │
                   │          Meter Service          │
                   │                │                │
                   │       ┌────────┴────────┐       │
                   │       │                 │       │
                   │       ▼                 ▼       │
                   │ UsageCounter       UsageEvent   │
                   │       │                 │       │
                   │       └────────┬────────┘       │
                   │                │                │
                   │                ▼                │
                   │             MongoDB             │
                   │                                 │
                   │                                 ▼
                   │                          Webhook Service
                   │                                 │
                   │                                 ▼
                   │                           Subscription
                   │
                   ▼
                Tenant
```

---

# Tech Stack

## Backend

* Node.js
* Express.js

## Database

* MongoDB
* Mongoose

## Authentication

* API Key authentication
* Tenant-level isolation

## Payments

* Razorpay Test Mode

## Scheduling

* Node Cron

## Testing

* Jest
* Supertest

## Security

* Helmet
* CORS
* Environment variables

---

# Project Structure

```text
flyrank-capstone-metering-billing/
│
├── src/
│   │
│   ├── config/
│   │   ├── database.js
│   │   ├── pricingConfig.js
│   │   └── razorpay.js
│   │
│   ├── controllers/
│   │   ├── aiController.js
│   │   ├── billingController.js
│   │   ├── generateController.js
│   │   ├── usageController.js
│   │   ├── usageSummaryController.js
│   │   └── webhookController.js
│   │
│   ├── middleware/
│   │   └── apiKeyAuth.js
│   │
│   ├── models/
│   │   ├── ApiKey.js
│   │   ├── PaymentEvent.js
│   │   ├── Plan.js
│   │   ├── Subscription.js
│   │   ├── Tenant.js
│   │   ├── UsageCounter.js
│   │   ├── UsageEvent.js
│   │   └── MonthlyUsage.js
│   │
│   ├── routes/
│   │   ├── aiRoutes.js
│   │   ├── billingRoutes.js
│   │   ├── generateRoutes.js
│   │   ├── usageRoutes.js
│   │   ├── usageSummaryRoutes.js
│   │   └── webhookRoutes.js
│   │
│   ├── services/
│   │   ├── costService.js
│   │   ├── meterService.js
│   │   ├── paymentService.js
│   │   ├── usageRollupJob.js
│   │   ├── webhookService.js
│   │   └── payment/
│   │       ├── paymentProvider.js
│   │       └── razorpayProvider.js
│   │
│   ├── utils/
│   │   └── seed.js
│   │
│   ├── app.js
│   └── server.js
│
├── tests/
│   ├── api.test.js
│   ├── costService.test.js
│   ├── meterService.race.test.js
│   └── webhook.test.js
│
├── public/
│   ├── payment.html
│   └── payment.js
│
├── .env
├── .env.example
├── .gitignore
├── BUILDLOG.md
├── README.md
├── package.json
└── package-lock.json
```

---

# Database Design

The application uses MongoDB with Mongoose.

## Tenant

Represents a customer/company using the platform.

Main fields:

```text
name
email
```

---

## Plan

Defines subscription limits and pricing.

Main fields:

```text
name
monthlyApiCalls
monthlyAiTokens
priceInMinorUnits
```

---

## Subscription

Connects a tenant with a plan.

Main fields:

```text
tenantId
planId
status
provider
providerSubscriptionId
```

Possible subscription statuses include:

```text
active
cancelled
past_due
```

---

## ApiKey

Associates an API key with a tenant.

Main fields:

```text
key
tenantId
active
```

---

## UsageEvent

Stores individual usage events.

Main fields:

```text
tenantId
type
quantity
idempotencyKey
inputTokens
cachedInputTokens
outputTokens
reasoningTokens
costInCents
createdAt
```

---

## UsageCounter

Stores current monthly counters.

Main fields:

```text
tenantId
month
apiCalls
aiTokens
```

The combination of:

```text
tenantId + month
```

is unique.

---

## MonthlyUsage

Stores aggregated monthly usage.

Main fields:

```text
tenantId
month
apiCalls
aiTokens
aiCostInCents
```

---

## PaymentEvent

Stores processed payment/webhook events.

This prevents duplicate webhook processing.

---

# API Endpoints

## Health Check

```http
GET /health
```

Example response:

```json
{
    "success": true,
    "message": "Usage Metering & Billing Engine is running"
}
```

---

# Generate API

```http
POST /api/generate
```

Authentication:

```http
x-api-key: YOUR_API_KEY
```

The endpoint represents a metered API request.

The request is:

1. Authenticated
2. Associated with a tenant
3. Checked for subscription
4. Checked against quota
5. Metered
6. Stored as a usage event

---

# AI Generate API

```http
POST /api/ai/generate
```

Authentication:

```http
x-api-key: YOUR_API_KEY
```

This endpoint supports AI token usage.

Token fields include:

```text
inputTokens
cachedInputTokens
outputTokens
reasoningTokens
```

The AI usage is converted into a cost using the pricing service.

---

# Usage Summary

```http
GET /api/usage/summary
```

Authentication:

```http
x-api-key: YOUR_API_KEY
```

Example response:

```json
{
    "success": true,
    "month": "2026-09",
    "plan": "FREE_TEST_PLAN",
    "usage": {
        "apiCalls": 1,
        "aiTokens": 2000
    },
    "limits": {
        "apiCalls": 1000,
        "aiTokens": 100000
    },
    "cost": {
        "aiCostInCents": 0
    }
}
```

---

# Billing Checkout

```http
POST /api/billing/checkout
```

Authentication:

```http
x-api-key: YOUR_API_KEY
```

The endpoint creates a Razorpay order for the Pro plan.

Example response structure:

```json
{
    "success": true,
    "message": "Checkout order created",
    "order": {
        "id": "order_xxxxx",
        "amount": 99900,
        "currency": "INR"
    },
    "razorpayKeyId": "rzp_test_xxxxx"
}
```

The actual amount is controlled by the configured Pro plan.

---

# Razorpay Webhook

```http
POST /api/webhooks/razorpay
```

This endpoint receives Razorpay webhook events.

The request body must be processed as raw JSON because Razorpay signature verification requires the original request body.

---

# Authentication

The application uses API-key-based authentication.

The client sends:

```http
x-api-key: YOUR_API_KEY
```

The middleware searches for an active API key:

```javascript
const apiKeyRecord = await ApiKey.findOne({
    key: apiKey,
    active: true
});
```

The tenant ID is then attached to the request:

```javascript
req.tenantId = apiKeyRecord.tenantId;
```

Controllers use:

```javascript
req.tenantId
```

instead of trusting a tenant ID supplied by the client.

This helps enforce tenant isolation.

---

# Tenant Isolation

Every usage event contains a:

```text
tenantId
```

Every usage counter is also tenant-specific.

Queries therefore use the authenticated tenant:

```javascript
{
    tenantId,
    month
}
```

This prevents one tenant from accessing another tenant's usage data through normal API requests.

---

# Idempotency

Idempotency is implemented using:

```text
tenantId + idempotencyKey
```

A unique database index prevents duplicate usage events.

Example:

```javascript
usageEventSchema.index(
    {
        tenantId: 1,
        idempotencyKey: 1
    },
    {
        unique: true
    }
);
```

---

## Idempotency Flow

```text
Request
   │
   ▼
Check existing UsageEvent
   │
   ├── Found ──────► Return existing event
   │
   └── Not Found
          │
          ▼
      Check quota
          │
          ▼
      Reserve quota
          │
          ▼
      Create UsageEvent
          │
          ├── Success ──► Return event
          │
          └── Duplicate ─► Roll back reservation
```

---

# Quota Enforcement

The system uses an atomic MongoDB update to reserve usage.

Conceptually:

```text
currentUsage + requestedQuantity <= planLimit
```

Only if this condition is true will MongoDB increment the counter.

For example:

```text
Monthly limit = 1000

Current usage = 995

Request = 5
```

The request is allowed:

```text
995 + 5 = 1000
```

But:

```text
Current usage = 995
Request = 6
```

results in:

```http
429 Too Many Requests
```

---

# Payment Required

Before usage is recorded, the system checks for an active subscription.

If there is no active subscription:

```http
402 Payment Required
```

Example:

```json
{
    "success": false,
    "message": "Payment required"
}
```

---

# AI Token Pricing

The pricing system supports four token categories:

```text
Input tokens
Cached input tokens
Output tokens
Reasoning tokens
```

Reasoning tokens are counted as output tokens.

Therefore:

```text
billable output tokens
=
output tokens + reasoning tokens
```

The pricing configuration currently uses:

```javascript
const AI_PRICING = {
    inputPerMillionTokensCents: 100,
    cachedInputPerMillionTokensCents: 25,
    outputPerMillionTokensCents: 300
};
```

---

## Example

For:

```text
1,000,000 input tokens
1,000,000 cached input tokens
1,000,000 output tokens
1,000,000 reasoning tokens
```

The cost is:

```text
Input:
100 cents

Cached input:
25 cents

Output:
300 cents

Reasoning:
300 cents
```

Total:

```text
725 cents
```

The implementation stores money using integer cents.

---

# Payment Flow

The payment flow is:

```text
Client
   │
   │ POST /api/billing/checkout
   ▼
Billing Controller
   │
   ▼
Payment Service
   │
   ▼
Razorpay Provider
   │
   ▼
Razorpay Test API
   │
   ▼
Order Created
   │
   ▼
Client Checkout
   │
   ▼
Payment Completed
   │
   ▼
Razorpay Webhook
   │
   ▼
Webhook Controller
   │
   ▼
Signature Verification
   │
   ▼
Payment Event Check
   │
   ▼
Subscription Activated
```

---

# Payment Provider Abstraction

The project separates payment-provider logic from the business layer.

Base provider:

```javascript
class PaymentProvider {
    async createOrder() {
        throw new Error("createOrder() must be implemented");
    }

    async getOrder() {
        throw new Error("getOrder() must be implemented");
    }
}
```

Razorpay implementation:

```text
PaymentProvider
       ▲
       │
RazorpayProvider
```

This makes it possible to introduce another provider later.

---

# Webhook Handling

Razorpay webhooks are protected using HMAC SHA-256 signature verification.

The general process is:

```text
Receive webhook
       │
       ▼
Read raw request body
       │
       ▼
Calculate HMAC SHA-256
       │
       ▼
Compare signatures
       │
       ├── Invalid ──► 400
       │
       └── Valid
             │
             ▼
       Check event ID
             │
             ├── Already processed
             │       │
             │       ▼
             │      Return success
             │
             └── New event
                     │
                     ▼
              Process payment
                     │
                     ▼
              Activate subscription
                     │
                     ▼
              Store PaymentEvent
```

---

# Webhook Idempotency

Webhook events are stored in the `PaymentEvent` collection.

Before processing an event, the system checks whether it has already been processed.

This prevents the same webhook from activating or modifying a subscription multiple times.

---

# Monthly Usage Rollup

The application contains a scheduled monthly rollup job.

The job uses:

```text
node-cron
```

The source of truth is:

```text
UsageEvent
```

The job aggregates:

```text
API calls
AI tokens
AI cost
```

and stores the result in:

```text
MonthlyUsage
```

---

## Rollup Process

```text
UsageEvent
    │
    ▼
Filter by month
    │
    ▼
Group by tenant
    │
    ├── API calls
    ├── AI tokens
    └── AI cost
    │
    ▼
MonthlyUsage
```

The scheduled job runs at the beginning of each month using UTC.

---

# Error Handling

The API uses appropriate HTTP status codes.

## 400 Bad Request

Used for invalid request data.

Example:

```json
{
    "success": false,
    "message": "quantity must be a positive number"
}
```

---

## 401 Unauthorized

Used when the API key is missing or invalid.

Example:

```json
{
    "success": false,
    "message": "API key is required"
}
```

---

## 402 Payment Required

Used when a tenant does not have an active subscription.

---

## 404 Not Found

Used when a required resource does not exist.

Example:

```json
{
    "success": false,
    "message": "Pro plan not found"
}
```

---

## 429 Too Many Requests

Used when the monthly quota has been exceeded.

Example:

```json
{
    "success": false,
    "message": "Usage quota exceeded"
}
```

---

## 500 Internal Server Error

Used for unexpected server-side failures.

---

# Environment Variables

Create a `.env` file in the project root.

Example:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

Never commit `.env` to Git.

---

# `.env.example`

A safe example configuration should contain placeholders:

```env
PORT=5000

MONGODB_URI=mongodb://localhost:27017/flyrank_metering

RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

---

# Installation

Clone the repository:

```bash
git clone <your-github-repository-url>
```

Navigate into the project:

```bash
cd flyrank-capstone-metering-billing
```

Install dependencies:

```bash
npm install
```

---

# Running the Project

Start the development server:

```bash
npm run dev
```

The server runs on:

```text
http://localhost:5000
```

---

# Health Check

Open:

```text
http://localhost:5000/health
```

Expected response:

```json
{
    "success": true,
    "message": "Usage Metering & Billing Engine is running"
}
```

---

# Seed Database

The project contains a seed script.

Run:

```bash
npm run seed
```

The seed script creates the required initial data such as plans, tenants, and API keys.

---

# Testing

Run all tests:

```bash
npm test
```

Current test result:

```text
Test Suites: 4 passed, 4 total
Tests:       20 passed, 20 total
Snapshots:   0 total
```

---

# Test Coverage Areas

The tests cover:

## API Tests

* Authentication
* Usage recording
* Payment-required behavior
* Quota enforcement
* AI usage
* Usage summary
* Billing authentication

---

## Cost Service Tests

Tests include:

* Input token pricing
* Cached input pricing
* Output pricing
* Reasoning token pricing
* Combined token pricing

---

## Race Condition Tests

The race-condition tests verify behavior when multiple usage requests are executed concurrently.

The test specifically covers duplicate usage and quota reservation behavior.

---

## Webhook Tests

Webhook tests verify:

* Signature verification
* Duplicate event handling
* Payment processing
* Subscription activation

---

# Security

The application includes several security measures.

## API Key Authentication

Every protected API endpoint requires a valid API key.

---

## Tenant Isolation

Tenant IDs come from the authenticated API key rather than from untrusted client input.

---

## Helmet

The application uses:

```text
helmet
```

for HTTP security headers.

---

## CORS

The application uses CORS middleware.

---

## Environment Variables

Sensitive credentials are stored in:

```text
.env
```

rather than source code.

---

## Webhook Signature Verification

Razorpay webhooks are verified using a cryptographic signature.

---

# Database Indexes

The application uses indexes for frequently queried fields.

## ApiKey

```text
key
tenantId
```

---

## UsageEvent

Unique:

```text
tenantId + idempotencyKey
```

Additional index:

```text
createdAt + tenantId + type
```

---

## UsageCounter

Unique:

```text
tenantId + month
```

---

## MonthlyUsage

Unique:

```text
tenantId + month
```

---

## Subscription

Index:

```text
tenantId
```

---

## Tenant

Unique:

```text
email
```

---

# Money Representation

The project does not use floating-point values for money.

Instead, monetary values are stored as integer minor units.

For example:

```text
₹999
```

is represented as:

```text
99900 paise
```

Similarly, AI costs are represented using integer cents in the cost calculation layer.

This avoids floating-point rounding problems.

---

# Design Decisions

## MongoDB

The original capstone specification discusses relational database options such as PostgreSQL/SQLite.

This implementation uses:

```text
MongoDB + Mongoose
```

instead.

MongoDB was selected for the implementation because it provides:

* Flexible document modeling
* Atomic update operations
* Unique indexes
* Easy local development
* Simple integration with Node.js

The data model still maintains explicit tenant relationships and indexes required by the application.

---

## UsageEvent as Source of Truth

`UsageEvent` is treated as the source of truth for historical usage.

`UsageCounter` is used for fast quota checking.

`MonthlyUsage` is used for aggregated historical reporting.

This gives the system:

```text
UsageEvent
     │
     ├── Source of truth
     │
     ├── UsageCounter
     │      └── Fast quota checking
     │
     └── MonthlyUsage
            └── Historical reporting
```

---

## Integer Money Values

Money is represented using integer minor units to avoid floating-point precision problems.

---

## Payment Provider Abstraction

Payment logic is separated from billing logic so that the payment provider can be replaced in the future.

---

# Known Limitations

## Idempotency Under True N-Way Concurrency Near the Quota Boundary

The idempotency check:

```text
UsageEvent.findOne()
```

and quota reservation are two separate operations rather than one fully atomic operation.

If the same idempotency key is submitted many times truly simultaneously, for example:

```text
15 identical requests
```

at the exact same moment, and the number of requests exceeds the remaining quota, some duplicate requests may receive:

```http
429 QUOTA_EXCEEDED
```

instead of being immediately recognized as duplicates.

This happens because multiple requests can reach quota reservation before any one of them creates the first `UsageEvent`.

Once requests are processed sequentially, the same idempotency key is correctly deduplicated.

Duplicate-event rollback is also implemented so that reserved quota can be released when duplicate insertion is detected.

This behavior is covered by:

```text
tests/meterService.race.test.js
```

The limitation primarily affects true simultaneous duplicate bursts beyond typical client retry behavior.

---

# Future Improvements

Potential future improvements include:

* Redis-based distributed rate limiting
* Distributed locking
* Stronger atomic idempotency reservation
* Subscription cancellation flow
* Subscription renewal handling
* More payment providers
* Production deployment
* Monitoring
* Structured logging
* OpenAPI/Swagger documentation
* Admin dashboard
* Usage analytics dashboard
* Automated database migrations
* More extensive integration tests
* Load testing
* Docker deployment
* CI/CD pipeline

---

# Example API Flows

## Successful API Usage

```text
Client
  │
  │ x-api-key
  │ idempotency key
  ▼
API
  │
  ▼
Authenticate tenant
  │
  ▼
Check existing event
  │
  ▼
Check subscription
  │
  ▼
Check quota
  │
  ▼
Reserve quota
  │
  ▼
Create UsageEvent
  │
  ▼
Return success
```

---

# Example: Duplicate Request

First request:

```text
idempotencyKey = request-123
```

The request creates:

```text
UsageEvent(request-123)
```

If the client retries:

```text
idempotencyKey = request-123
```

the existing event is found.

The system does not create another usage event.

---

# Example: Quota Exceeded

Suppose:

```text
Monthly limit = 1000 API calls
Current usage = 1000
```

Another request arrives.

The atomic quota update fails.

Response:

```http
429 Too Many Requests
```

No additional usage should be recorded.

---

# Example: No Subscription

If a tenant does not have an active subscription:

```text
Client
   │
   ▼
API request
   │
   ▼
Authentication
   │
   ▼
No active subscription
   │
   ▼
402 Payment Required
```

---

# Example: AI Cost

Suppose an AI request consumes:

```text
Input tokens       = 100,000
Cached input       = 50,000
Output tokens      = 20,000
Reasoning tokens   = 10,000
```

The cost service calculates the cost using:

```text
Input pricing
+
Cached input pricing
+
Output pricing
+
Reasoning pricing
```

The resulting cost is stored in:

```text
UsageEvent.costInCents
```

---

# NPM Scripts

The project provides the following scripts:

```json
{
    "scripts": {
        "dev": "nodemon src/server.js",
        "start": "node src/server.js",
        "test": "jest --runInBand",
        "seed": "node src/utils/seed.js"
    }
}
```

Run development mode:

```bash
npm run dev
```

Run production-style start:

```bash
npm start
```

Run tests:

```bash
npm test
```

Seed database:

```bash
npm run seed
```

---

# Development Workflow

Typical development workflow:

```text
1. Start MongoDB
        │
        ▼
2. Configure .env
        │
        ▼
3. Run seed script
        │
        ▼
4. Start Express server
        │
        ▼
5. Test API endpoints
        │
        ▼
6. Run Jest tests
        │
        ▼
7. Test Razorpay flow
        │
        ▼
8. Test webhook
        │
        ▼
9. Run complete test suite
```

---

# Implementation Status

| Feature                        | Status    |
| ------------------------------ | --------- |
| Express backend                | Completed |
| MongoDB integration            | Completed |
| Tenant model                   | Completed |
| Plan model                     | Completed |
| Subscription model             | Completed |
| API key authentication         | Completed |
| API usage metering             | Completed |
| AI token metering              | Completed |
| Idempotency                    | Completed |
| Atomic quota reservation       | Completed |
| 402 payment required           | Completed |
| 429 quota enforcement          | Completed |
| AI cost calculation            | Completed |
| Reasoning token pricing        | Completed |
| Razorpay integration           | Completed |
| Payment provider abstraction   | Completed |
| Razorpay webhook               | Completed |
| Webhook signature verification | Completed |
| Webhook idempotency            | Completed |
| Subscription activation        | Completed |
| Usage summary                  | Completed |
| Monthly rollup                 | Completed |
| Background job                 | Completed |
| Automated tests                | Completed |
| Environment configuration      | Completed |
| Security middleware            | Completed |
| Production deployment          | Planned   |
| Advanced distributed locking   | Planned   |
| Admin dashboard                | Planned   |

---

# Test Result

The current automated test suite passes successfully:

```text
Test Suites: 4 passed, 4 total
Tests:       20 passed, 20 total
Snapshots:   0 total
```

The test suite validates the core backend functionality including:

```text
Authentication
Usage metering
Idempotency
Quota enforcement
AI token pricing
Payment behavior
Webhook processing
Concurrent usage behavior
Usage summaries
```

---

# Project Goals

The main goals of this project are:

1. Build a reliable usage metering service.
2. Support multi-tenant usage tracking.
3. Prevent duplicate usage through idempotency.
4. Enforce monthly quotas.
5. Calculate AI usage costs.
6. Integrate payment processing.
7. Process payment webhooks safely.
8. Provide monthly usage reporting.
9. Maintain a clean service-based architecture.
10. Demonstrate backend engineering practices suitable for production-oriented SaaS systems.

---

# License

This project was created as part of the FlyRank Backend AI Engineering Capstone.

---

# Author

**Shibnath Maity**

Backend AI Engineering / Software Development

---

# Final Architecture Summary

```text
                         ┌───────────────────┐
                         │      Client       │
                         └─────────┬─────────┘
                                   │
                              API Key
                                   │
                                   ▼
                         ┌───────────────────┐
                         │   Express API     │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ API Key Auth      │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Tenant Resolution │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │  Meter Service    │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
              Subscription   UsageCounter    UsageEvent
                    │              │              │
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                                   ▼
                              MongoDB
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
              MonthlyUsage                  PaymentEvent
                                                  │
                                                  ▼
                                          Webhook Service
                                                  │
                                                  ▼
                                             Razorpay
```

---

## Summary

The **Usage Metering & Billing Engine** provides the core backend infrastructure required for a multi-tenant SaaS billing system.

It combines:

* API-key authentication
* Tenant isolation
* Usage metering
* Idempotency
* Atomic quota enforcement
* AI token accounting
* AI cost calculation
* Razorpay payments
* Webhook verification
* Subscription activation
* Monthly usage summaries
* Background aggregation
* Automated testing

The architecture separates controllers, services, models, middleware, payment providers, and background jobs to keep the implementation maintainable and extensible.

```


