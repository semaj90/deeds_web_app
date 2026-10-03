# Pass Fabric Design

## Context

The analysis worker claims queued jobs from `analysis_jobs` in bounded batches. `claimBatch` owns the atomic PostgreSQL claim statement (`FOR UPDATE SKIP LOCKED`); `worker.ts` computes available gate capacity and supplies that bound. LISTEN/NOTIFY is a wake-up optimization, while the 30-second poll remains the recovery path. Pass execution history and pass identity are separate: an execution key identifies one attempt, while a logical pass identity is only admissible when its stable source/input lineage is available.

The task board contains older unchecked PF0–PF3 items even though its status note and current source describe those mechanics as implemented. This design preserves that evidence while distinguishing source/fixture proof from live PostgreSQL concurrency proof.

## Goals and non-goals

- Never claim work when the requested capacity is zero, negative, non-finite, or otherwise invalid.
- Claim no more rows than the caller's available capacity in one atomic statement.
- Keep notification wake-up and periodic polling as complementary mechanisms.
- Preserve execution history independently from any current-result materialization.
- Make proof scope explicit; mocked tests do not establish live database locking or throughput.

This tranche does not run migrations, write to a live database, promote pass identity, add a second queue/cache owner, or execute model-backed passes.

## Decisions

1. `claimBatch` validates the limit before touching the database. A finite positive value is floored to an integer; an invalid or non-positive value returns an empty batch without a query.
2. The PostgreSQL claim remains one CTE/update statement with `FOR UPDATE SKIP LOCKED`; the worker remains responsible for computing gate capacity.
3. LISTEN/NOTIFY may reduce wake latency but does not replace the periodic poll or claim-time concurrency control.
4. `pass_key` remains execution/retry identity. Logical identity/currentness must not be inferred from it, and stochastic execution history must not be collapsed by deterministic deduplication.
5. Any future schema or writer change requires a separate migration/readback gate and explicit authorization.

## Risks and proof limits

- Unit tests can prove zero-capacity short-circuiting and one bounded SQL call with a mocked executor; they cannot prove PostgreSQL lock behavior, cross-worker exclusion, notification latency, or live throughput.
- The legacy PF checklist must be reconciled against current source and runtime receipts without converting source inspection into live proof.
- Packet/pass writer lineage and live readback remain separate dependencies.

## Migration plan

No migration or live apply is part of this design. Future persistence changes must first establish table/column ownership, run read-only prechecks, and obtain the required authorization before applying a migration or writer.

## Open questions

- Which pass families have a stable, canonical logical identity suitable for current-result materialization?
- What live PostgreSQL concurrency receipt will close the remaining cross-worker claim proof?
- Which pass writers remain blocked on canonical packet/source identity ownership?
