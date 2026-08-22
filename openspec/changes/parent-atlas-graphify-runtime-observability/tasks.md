# Tasks: parent-atlas-graphify-runtime-observability

## Ownership invariant

This change observes the existing daily Graphify pipeline. It does not become a second indexing owner, cache owner, revision owner, or event ledger.

```text
Graphify daily chain = work owner
PostgreSQL          = canonical persistence + cumulative I/O telemetry
Valkey / BitFrost   = rebuildable hot cache/routing plane + cumulative cache telemetry
observer            = read-only before/after snapshots + derived delta receipt
```

PostgreSQL and Valkey counters are server/cluster cumulative. A before/after delta is evidence of activity during the observation window, not proof that every delta was caused exclusively by Graphify.

## OBS-01 — Read-only baseline/completion snapshots

- [x] Add `scripts/atlas/probe-graphify-runtime-observability.mjs`.
- [x] Probe PostgreSQL version and AIO-related settings without changing configuration.
- [x] Probe `pg_stat_io` when available; fail open with an explicit unavailable/error field on older/incompatible servers.
- [x] Probe Valkey server/memory/stats/keyspace INFO without writing cache values.
- [x] Count bounded BitFrost key prefixes using SCAN, never KEYS.
- [x] Redact connection URLs from errors.
- [ ] Add `pg_aios` occupancy sampling for PostgreSQL 18 when live runtime proves the view is available and useful on this workstation.

## OBS-02 — Delta receipt

- [x] Add `scripts/atlas/compare-graphify-runtime-observability.mjs`.
- [x] Compute `pg_stat_io` counter deltas by backend/object/context.
- [x] Compute Valkey command/hit/miss/expired/evicted/network deltas.
- [x] Compute BitFrost prefix-count deltas.
- [x] Mark attribution as non-exclusive and observer writes as false.
- [ ] Add wall-clock duration and normalized per-second rates after first real workstation receipt.
- [ ] Add alert thresholds only after baseline distributions exist; do not invent thresholds from one run.

## OBS-03 — Daily Graphify wrapper

- [x] Add `scripts/startup/run-graphify-daily-observed.mjs`.
- [x] Capture telemetry before and after the existing `run-graphify-daily-startup.mjs` owner.
- [x] Preserve Graphify's real exit code.
- [x] Telemetry failure is nonblocking and cannot convert a failed Graphify run into success.
- [ ] Decide whether this wrapper replaces the current VS Code/startup entry only after one clean workstation proof.

## PG18-AIO-01 — PostgreSQL 18 evidence, not tuning

- [ ] Run the observer against the actual workstation database and record `server_version_num`.
- [ ] Record `io_method`; classify `worker`, `io_uring`, or `sync` from runtime evidence.
- [ ] Record `effective_io_concurrency`, `maintenance_io_concurrency`, `io_max_concurrency`, `io_workers`, and combine-limit settings where exposed.
- [ ] Measure sequential/bitmap/vacuum-heavy Graphify phases against `pg_stat_io` deltas before changing any AIO setting.
- [ ] Keep tuning out of the daily indexing path. Any setting change needs its own benchmark/rollback receipt.

## VALKEY-OBS-01 — BitFrost / Redis-Valkey telemetry

- [x] Reuse the existing Redis/Valkey client factory rather than creating another client owner.
- [x] Treat BitFrost prefixes as cache/routing observations, not canonical identity.
- [ ] Correlate hit/miss changes with temporal `ExecutionReuseDecisionV1` after the action ledger integration is live.
- [ ] Add stale-revision invalidation delivery proof; existing CLIENT TRACKING capability proof is not the same as delivery proof.
- [ ] Measure cache reuse utility before enabling automatic warming from daily Graphify.

## TEMP-OBS-01 — Temporal action ledger linkage

Current `packages/parent-atlas/src/core/temporal-action-ledger.ts` already owns the temporal action contract on main. Do not reintroduce the older branch-local duplicate contract.

- [ ] Emit one observation/result artifact reference from the daily Graphify workflow into the existing temporal action ledger after its durable append owner is proven.
- [ ] Execution key must include applicable proven revisions; telemetry timestamps never substitute for workspace/source revision authority.
- [ ] Exact prior success may reuse an immutable result reference only when the temporal applicability gate passes.
- [ ] A telemetry delta receipt is supporting evidence, not an action result by itself.

## Workstation proof sequence

```text
node scripts/atlas/probe-graphify-runtime-observability.mjs --phase=baseline
node scripts/startup/run-graphify-daily-observed.mjs

inspect:
  docs/reports/graphify-runtime-before.json
  docs/reports/graphify-runtime-after.json
  docs/reports/graphify-runtime-delta.json
```

Target first proof:

```text
POSTGRES_REACHABLE
SERVER_VERSION_CAPTURED
AIO_METHOD_OBSERVED_OR_EXPLICITLY_UNAVAILABLE
PG_STAT_IO_CAPTURED_OR_EXPLICITLY_UNAVAILABLE
VALKEY_REACHABLE
BITFROST_PREFIX_COUNTS_CAPTURED
GRAPHIFY_EXIT_CODE_PRESERVED
OBSERVER_CANONICAL_WRITES_FALSE
```
