# FlyRank Backend AI Engineering Capstone

## Usage Metering & Billing Engine

---

## 1. Project Overview

This project implements a backend Usage Metering & Billing Engine for a multi-tenant SaaS application.

The system provides:

- API usage metering
- AI token metering
- Monthly quota enforcement
- Idempotent usage recording
- AI usage cost calculation
- Subscription and payment handling
- Razorpay payment integration
- Razorpay webhook verification
- Monthly usage summaries
- Monthly usage rollups
- Automated tests

---

# 2. Development Environment

## Runtime

- Node.js
- Express.js
- MongoDB
- Mongoose

## Development Tools

- VS Code
- Git
- GitHub
- Postman / API testing tools
- Jest
- Supertest

## Payment Provider

Razorpay Test Mode

---

# 3. Initial Project Setup

The project was initialized as a Node.js backend application.

The following dependencies were installed:

```bash
npm install express mongoose dotenv cors helmet morgan
```

````

Development dependencies:

```bash
npm install -D nodemon jest supertest
```

Payment integration:

```bash
npm install razorpay
```

Background scheduling:

```bash
npm install node-cron
```

---

# 4. Backend Architecture

The application was divided into separate layers:

```text
Routes
   ↓
Controllers
   ↓
Services
   ↓
Models
   ↓
MongoDB
```

Additional layers were added for:

- Authentication
- Payment providers
- Webhooks
- Background jobs
- Configuration

This separation keeps business logic out of route definitions and makes the system easier to extend.

---

# 5. Database Setup

MongoDB was selected as the database for this implementation.

The MongoDB connection is handled through:

```text
src/config/database.js
```

The connection string is stored in:

```text
.env
```

The application does not store database credentials directly in source code.

---

# 6. Tenant Model

A tenant represents a customer or organization using the metering system.

The `Tenant` model stores information such as:

```text
name
email
```

The email field is unique.

Tenant IDs are referenced by other models to maintain tenant-level isolation.

---

# 7. Plan Model

A `Plan` model was created to store subscription limits and pricing.

The main fields are:

```text
name
monthlyApiCalls
monthlyAiTokens
priceInMinorUnits
```

This allows the usage limits to be configured through database records instead of hardcoding limits into the metering logic.

---

# 8. Subscription Model

The `Subscription` model connects a tenant with a plan.

Important fields include:

```text
tenantId
planId
status
provider
providerSubscriptionId
```

Supported subscription states include:

```text
active
cancelled
past_due
```

The metering system checks for an active subscription before allowing usage.

---

# 9. API Key Authentication

API-key authentication was implemented using:

```text
src/middleware/apiKeyAuth.js
```

Clients provide:

```http
x-api-key: YOUR_API_KEY
```

The middleware:

1. Reads the API key.
2. Searches for an active API key.
3. Resolves the associated tenant.
4. Stores the tenant ID in `req.tenantId`.

Example:

```javascript
req.tenantId = apiKeyRecord.tenantId;
```

This prevents controllers from relying on a tenant ID supplied by the client.

---

# 10. Usage Event Model

The `UsageEvent` model was created to store individual usage records.

Supported usage types:

```text
API_CALL
AI_TOKENS
```

The model stores:

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

# 11. Idempotency Implementation

Idempotency was implemented using:

```text
tenantId + idempotencyKey
```

A unique compound index was added:

```javascript
usageEventSchema.index(
  {
    tenantId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);
```

The metering service first checks whether the event already exists.

If it exists, the existing event is returned.

This prevents normal retry requests from being recorded multiple times.

---

# 12. Usage Counter

A separate `UsageCounter` collection was created for fast quota checks.

The counter contains:

```text
tenantId
month
apiCalls
aiTokens
```

The following combination is unique:

```text
tenantId + month
```

This allows each tenant to have an independent monthly counter.

---

# 13. Atomic Quota Enforcement

Quota enforcement was implemented using MongoDB's atomic update operations.

Instead of:

```text
Read usage
↓
Check usage
↓
Write usage
```

the system performs the quota condition and increment as part of the database update.

Conceptually:

```text
current usage + requested quantity <= limit
```

Only when the condition is satisfied is the counter incremented.

This prevents normal concurrent requests from simply reading the same old counter value and both passing the quota check.

---

# 14. Payment Required Logic

The metering service checks whether the tenant has an active subscription.

If no active subscription exists:

```http
402 Payment Required
```

is returned.

This check occurs before usage is recorded.

---

# 15. AI Token Metering

AI usage supports:

```text
Input tokens
Cached input tokens
Output tokens
Reasoning tokens
```

The `AI_TOKENS` usage event stores the token breakdown.

The total usage quantity is tracked through the AI token counter.

---

# 16. AI Pricing Service

AI pricing was separated into:

```text
src/services/costService.js
```

Pricing configuration is stored in:

```text
src/config/pricingConfig.js
```

Current pricing configuration:

```javascript
const AI_PRICING = {
  inputPerMillionTokensCents: 100,
  cachedInputPerMillionTokensCents: 25,
  outputPerMillionTokensCents: 300,
};
```

Reasoning tokens are counted as output tokens.

Therefore:

```text
billable output tokens
=
output tokens + reasoning tokens
```

---

# 17. Cost Calculation Testing

The cost service was tested using multiple token combinations.

Tests include:

- Input token pricing
- Cached input pricing
- Output token pricing
- Reasoning token pricing
- Combined token pricing

One test verifies:

```text
1M input
+
1M cached input
+
1M output
+
1M reasoning
```

produces:

```text
725 cents
```

Another test verifies reasoning-only usage is charged using output pricing.

---

# 18. Generate API

The main metered API endpoint was implemented:

```http
POST /api/generate
```

The route uses API-key authentication.

Flow:

```text
Request
 ↓
API key authentication
 ↓
Tenant identification
 ↓
Usage metering
 ↓
Quota validation
 ↓
Usage event creation
 ↓
Response
```

---

# 19. AI Generate API

An AI-specific endpoint was implemented:

```http
POST /api/ai/generate
```

The endpoint records AI token usage.

It supports:

```text
inputTokens
cachedInputTokens
outputTokens
reasoningTokens
```

The cost service calculates the associated AI cost.

---

# 20. Usage Summary API

The following endpoint was implemented:

```http
GET /api/usage/summary
```

It returns:

```text
Current month
Plan
API usage
AI token usage
API limits
AI token limits
AI cost
```

The summary is calculated using the authenticated tenant.

---

# 21. Billing Service

A billing service was implemented to separate payment-provider communication from the controller.

The service uses:

```text
src/services/paymentService.js
```

The payment provider is selected through:

```text
src/services/payment/
```

---

# 22. Payment Provider Abstraction

A base payment provider interface was created:

```text
src/services/payment/paymentProvider.js
```

The provider defines methods such as:

```javascript
createOrder();
getOrder();
```

The Razorpay implementation is:

```text
src/services/payment/razorpayProvider.js
```

This allows additional payment providers to be implemented later.

---

# 23. Razorpay Integration

Razorpay Test Mode was integrated.

The Razorpay configuration is stored in:

```text
src/config/razorpay.js
```

Credentials are loaded from environment variables.

The checkout endpoint:

```http
POST /api/billing/checkout
```

creates a Razorpay order.

The response contains the order ID and public Razorpay key ID required by the frontend checkout flow.

---

# 24. Razorpay Checkout Page

A small frontend checkout interface was created under:

```text
public/
```

Files:

```text
payment.html
payment.js
```

The frontend uses the order created by the backend and opens Razorpay Checkout.

---

# 25. Razorpay Webhook

A webhook endpoint was implemented:

```http
POST /api/webhooks/razorpay
```

The webhook route is intentionally registered before the normal JSON parser.

This is required because Razorpay signature verification uses the original raw request body.

---

# 26. Webhook Signature Verification

Webhook signatures are verified using:

```text
HMAC SHA-256
```

The calculated signature is compared against the Razorpay signature.

Invalid signatures are rejected.

This prevents arbitrary clients from sending fake payment events to the webhook endpoint.

---

# 27. Webhook Idempotency

Webhook events can sometimes be delivered more than once.

To handle this, a `PaymentEvent` model was created.

Before processing an event, the service checks whether the event has already been recorded.

If the event already exists, it is not processed again.

---

# 28. Subscription Activation

After a valid payment event is received:

```text
Webhook
 ↓
Signature verification
 ↓
Payment event validation
 ↓
Retrieve Razorpay order
 ↓
Read tenantId
 ↓
Read planId
 ↓
Create/update subscription
 ↓
Mark subscription active
 ↓
Record payment event
```

This allows a successful payment to activate the tenant's plan.

---

# 29. Monthly Usage Summary

A monthly usage summary system was added.

The summary is based on the current UTC billing month.

Example:

```text
2026-09
```

The response includes:

```text
API calls
AI tokens
Plan limits
AI cost
```

---

# 30. Monthly Usage Rollup

A background rollup job was implemented using:

```text
node-cron
```

The implementation is:

```text
src/services/usageRollupJob.js
```

The job aggregates `UsageEvent` records.

It calculates:

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

# 31. UsageEvent as Source of Truth

During development, a difference was observed between historical `UsageEvent` totals and the current `UsageCounter`.

The `UsageEvent` collection was therefore treated as the source of truth for historical rollups.

`UsageCounter` remains responsible for fast current quota enforcement.

This provides the following separation:

```text
UsageEvent
    ↓
Historical source of truth

UsageCounter
    ↓
Fast quota enforcement

MonthlyUsage
    ↓
Aggregated reporting
```

---

# 32. Database Indexes

Indexes were added to improve performance and enforce uniqueness.

Important indexes include:

```text
Tenant.email
ApiKey.key
ApiKey.tenantId
Subscription.tenantId
UsageEvent.tenantId + idempotencyKey
UsageEvent.createdAt + tenantId + type
UsageCounter.tenantId + month
MonthlyUsage.tenantId + month
```

The idempotency and monthly usage indexes are unique where required.

---

# 33. Money Representation

Money is stored using integer minor units.

For example:

```text
₹999
```

is represented as:

```text
99900 paise
```

AI cost calculations use integer cents.

This avoids floating-point rounding issues.

---

# 34. Security Configuration

The application uses:

```text
helmet
cors
dotenv
API key authentication
webhook signature verification
```

Sensitive values are stored in `.env`.

The `.gitignore` contains:

```text
.env
node_modules/
coverage/
```

---

# 35. Environment Variables

The application requires:

```text
PORT
MONGODB_URI
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

An `.env.example` file is included with placeholders.

Actual secrets are not intended to be committed to Git.

---

# 36. Testing Setup

Jest and Supertest were added for automated testing.

Test command:

```bash
npm test
```

The project uses:

```text
--runInBand
```

to run the Jest test suites sequentially.

---

# 37. API Test Coverage

The API test suite covers:

- Health endpoint
- API-key authentication
- Missing API key
- Invalid API key
- Payment-required response
- Successful usage
- Duplicate usage
- Quota exceeded response
- AI usage
- Usage summary
- Billing authentication
- Billing checkout

---

# 38. Race Condition Testing

A dedicated test file was created:

```text
tests/meterService.race.test.js
```

It tests concurrent usage requests and quota reservation behavior.

The test helps verify that the atomic counter update does not allow normal concurrent requests to exceed the configured quota.

---

# 39. Known Concurrency Limitation

The idempotency lookup and quota reservation are separate operations.

Therefore, under a true N-way simultaneous duplicate burst near the quota boundary, some duplicate requests can reach the quota reservation step before the first request creates the corresponding `UsageEvent`.

In that situation, some duplicate requests may receive:

```http
429 QUOTA_EXCEEDED
```

instead of immediately receiving the already-created usage event.

After the first request has been processed, subsequent retries using the same idempotency key are correctly deduplicated.

The current implementation also rolls back reserved quota when duplicate event creation is detected.

---

# 40. Test Results

Current test result:

```text
Test Suites: 4 passed, 4 total
Tests:       20 passed, 20 total
Snapshots:   0 total
```

The passing suites are:

```text
api.test.js
costService.test.js
meterService.race.test.js
webhook.test.js
```

---

# 41. Manual Razorpay Test

Razorpay Test Mode was used to verify the payment flow.

The tested flow was:

```text
Create checkout order
        ↓
Open Razorpay checkout
        ↓
Complete test payment
        ↓
Razorpay webhook
        ↓
Signature verification
        ↓
Payment event processing
        ↓
Subscription activation
```

The subscription activation was verified in MongoDB.

---

# 42. Error Handling

The backend uses HTTP status codes based on the type of failure.

```text
400 → Invalid request
401 → Missing/invalid API key
402 → Payment required
404 → Resource not found
429 → Quota exceeded
500 → Internal server error
```

---

# 43. API Response Design

Responses generally follow:

```json
{
  "success": true,
  "message": "..."
}
```

Error responses follow:

```json
{
  "success": false,
  "message": "..."
}
```

This provides a consistent response structure.

---

# 44. Project Structure

Final project structure:

```text
flyrank-capstone-metering-billing/
│
├── src/
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

# 45. Design Decision: MongoDB

The original project specification discusses relational database options.

For this implementation, MongoDB was selected.

The project therefore uses:

```text
MongoDB
+
Mongoose
```

instead of PostgreSQL/SQLite.

The implementation still maintains:

- Tenant relationships
- Unique constraints
- Usage indexes
- Subscription relationships
- Idempotency constraints
- Monthly usage aggregation

---

# 46. Design Decision: Payment Provider Abstraction

Instead of directly placing Razorpay logic throughout the application, payment functionality was separated into:

```text
PaymentService
PaymentProvider
RazorpayProvider
```

This provides a cleaner architecture and makes future provider replacement easier.

---

# 47. Design Decision: Usage Counter vs Usage Event

Two different storage concepts are used.

## UsageEvent

Used for:

- Audit history
- Idempotency
- Historical reporting
- Cost information

## UsageCounter

Used for:

- Fast quota checking
- Current monthly usage

## MonthlyUsage

Used for:

- Aggregated monthly reporting

This separation avoids using a single collection for every responsibility.

---

# 48. Final Verification

Before submission, the following checks should be performed:

```bash
npm test
```

Then:

```bash
npm run seed
```

Then:

```bash
npm run dev
```

Verify:

```text
GET /health
```

Then verify:

```text
POST /api/generate
POST /api/ai/generate
GET  /api/usage/summary
POST /api/billing/checkout
POST /api/webhooks/razorpay
```

---

# 49. Final Test Checklist

```text
[✓] MongoDB connection
[✓] Tenant creation
[✓] Plan creation
[✓] API key authentication
[✓] API usage metering
[✓] AI token metering
[✓] Idempotency
[✓] Atomic quota reservation
[✓] 402 payment required
[✓] 429 quota exceeded
[✓] AI cost calculation
[✓] Reasoning token pricing
[✓] Razorpay order creation
[✓] Razorpay checkout
[✓] Razorpay webhook
[✓] Webhook signature verification
[✓] Webhook idempotency
[✓] Subscription activation
[✓] Usage summary
[✓] Monthly rollup
[✓] Automated tests
[✓] Environment configuration
[✓] Tenant isolation
```

---

# 50. Current Status

The core backend implementation is complete.

Current automated test result:

```text
4 test suites passed
20 tests passed
```

The remaining work is primarily focused on:

- Documentation refinement
- Final requirement verification
- Security review
- Git cleanup
- Submission preparation
- Optional production deployment

---

# 51. Final Architecture

```text
                       CLIENT
                          │
                          ▼
                  ┌───────────────┐
                  │ Express API   │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ API Key Auth  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Controllers   │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   Services    │
                  └───────┬───────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
        MeterService CostService PaymentService
             │            │            │
             │            │            ▼
             │            │       Razorpay
             │            │
             ▼            ▼
       UsageCounter   UsageEvent
             │            │
             └──────┬─────┘
                    │
                    ▼
                 MongoDB
                    │
                    ▼
              MonthlyUsage

Razorpay
    │
    ▼
Webhook
    │
    ▼
WebhookService
    │
    ▼
Subscription
```

---

# 52. Conclusion

The Usage Metering & Billing Engine demonstrates a backend architecture for a multi-tenant SaaS platform with usage-based limits and billing.

The implementation covers:

- Authentication
- Tenant isolation
- Usage metering
- Idempotency
- Atomic quota enforcement
- AI token accounting
- AI pricing
- Payment processing
- Webhook verification
- Subscription activation
- Monthly reporting
- Background aggregation
- Automated testing

The project is structured to allow additional payment providers, more advanced usage models, distributed locking, monitoring, and production deployment to be added in the future.

````

### After replacing `BUILDLOG.md`

Run these **two commands**:

```bash
git status
```

then:

```bash
npm test
```

I
