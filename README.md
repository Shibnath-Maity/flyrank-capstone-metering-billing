### Known limitations

- **Idempotency under true N-way concurrency near the quota boundary.** The idempotency
  check (`UsageEvent.findOne` by `idempotencyKey`) and quota reservation are two separate
  operations rather than a single atomic step. If the _same_ idempotency key is sent many
  times truly simultaneously (e.g. 15 identical requests fired in the same instant) and the
  number of simultaneous duplicates exceeds the tenant's remaining quota, some of those
  duplicate requests can receive a `429 QUOTA_EXCEEDED` instead of being recognized as a
  duplicate — because they race into quota reservation before any of them has written the
  first `UsageEvent`. Requests are always deduplicated correctly once processed sequentially,
  and true-duplicate rollback (releasing over-reserved quota) is fully race-safe (see
  `tests/meterService.race.test.js`). This only affects true simultaneous-duplicate bursts
  beyond typical client retry behavior (which normally includes jitter/backoff), not the
  standard "retry the same request" case the capstone's idempotency probe tests.
