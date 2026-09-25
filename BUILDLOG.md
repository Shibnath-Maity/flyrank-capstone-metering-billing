## MeterService: UsageCounter race-safety fix + verification

**Bug found:** `UsageCounter.findOneAndUpdate` in `meterService.js` used `$setOnInsert`
without `upsert: true`. For a tenant's first request in a billing month, no counter
document existed yet, so the query matched nothing, returned `null`, and was
misread as `QUOTA_EXCEEDED` (429) — even though the tenant was nowhere near their
limit. Confirmed via `checkCounter.js` (NO COUNTER FOUND) vs `checkUsage.js`
(UsageEvent already existed with correct totals).

**Fix:** split quota reservation into two steps:

1. `findOneAndUpdate({tenantId, month}, {$setOnInsert: {...}}, {upsert: true})` —
   guarantees the counter document exists, touching only `{tenantId, month}` in its
   filter so it's always safe to upsert.
2. The original atomic `$expr`-guarded reservation query, unchanged, with **no**
   upsert — combining upsert with the quota-check `$expr` filter would be unsafe
   (a legitimately-exceeded quota with no existing doc could cause Mongo to insert
   an incorrect new document instead of returning null).

**Verification:** wrote `tests/meterService.race.test.js`, calling `MeterService`
directly with concurrent `Promise.all` batches to prove:

- counter auto-creation on first use,
- quota cannot be exceeded under N-way concurrent distinct requests (API_CALL and
  AI_TOKENS both verified),
- duplicate idempotency keys roll back over-reserved quota correctly.

**Environment detour (AI-assisted, documented per capstone rules):** the test suite
hung indefinitely under Jest only (plain `node` scripts connected in <100ms). Ruled
out, in order: IPv6/localhost DNS stall on Windows, replica-set topology discovery,
Jest's jsdom environment, a Jest worker-process issue, and a `setupFiles` auto-connect
conflict — each ruled out with a targeted test (raw TCP check, `rs.status()`,
`--runInBand`, `@jest-environment node` docblock, config inspection). Root cause:
`mongoose@^9.10.1`'s connection handshake was failing to build a valid client
metadata document (`Missing required sub-document 'driver'`), a bug corroborated by
an open upstream issue (Automattic/mongoose#15785) affecting the same code area in
the 9.x line. Fixed by pinning `mongoose` to `^8`, a long-stable major version with
no such issues. All 6 "distinct request" race tests pass cleanly after the downgrade.

**Known limitation documented (not fixed — acceptable for capstone scope):** true
N-way simultaneous duplicate requests (same idempotency key, no gap between them)
can, if they outnumber remaining quota, cause some duplicates to see a false 429
instead of being deduplicated, because the idempotency check and quota reservation
are not a single atomic step. Standard sequential retries (the capstone's actual
idempotency probe) are unaffected. See README "Known limitations".
