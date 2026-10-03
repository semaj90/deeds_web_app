# Kafka Projection Initiative Tasks

This is the execution ledger for the existing `PA-KAFKA-001` projection owner.
It does not create another event authority, alter PostgreSQL configuration, or
authorize a Kafka deployment. PostgreSQL remains canonical; Kafka/CDC is a
rebuildable projection and transport lane.

## Readiness and contract gates

- [ ] KAFKA-01 Read-only readiness audit of the current PostgreSQL 18 WAL
  settings, logical-replication capacity, publication/slot state, broker and
  connector availability, and the actual producer/consumer gap. Capture
  versions, health, and source revisions. Do not change `wal_level`, create a
  slot/publication, or retain WAL as part of this audit.
- [ ] KAFKA-02 Define a revision-bound event envelope that carries canonical
  source/task/packet identity, source/workspace revision, commit LSN, schema
  revision, event time, idempotency key, and checksum. Transport offsets and
  Kafka keys remain projection coordinates, never canonical identity.
- [ ] KAFKA-03 Prove bounded, idempotent replay and readback for one disposable
  fixture: duplicate delivery, out-of-order events, consumer restart, offset
  rewind, poison event, retention expiry, and back-pressure. No canonical
  PostgreSQL evidence or task state is changed by the consumer.
- [ ] KAFKA-04 Specify event-time sliding-window summaries with explicit
  window size, watermark/lateness, deduplication, retention, and feature
  revision. Emit aggregate proposal features only; a window result cannot
  become proof, ontology authority, or an independent retrieval vote.
- [ ] KAFKA-05 Require an approved disposable-environment deployment plan,
  schema/readback receipt, rollback procedure, and projection parity gate
  before enabling logical replication or production connector writes.

## Safety boundary

- [ ] KAFKA-06 Reject hidden thoughts, prompts, KV/DeltaNet state, raw model
  activations, GPU pointers, and unqualified tensors from the durable event
  stream. Any approved numerical summaries must be aggregate-only, bounded,
  revision-qualified, and reconstructible or explicitly non-reconstructible.
- [ ] KAFKA-07 Keep domain/NLP/classifier outputs proposal-only until the
  existing `parent-atlas-workstation-domain-classifier` label, model, and
  readback gates pass. Keep tensor/window analysis under
  `parent-atlas-tensor-residency-integration`; this file owns only their event
  projection contract.

## Current observation

The 2026-10-02 PostgreSQL restart completed recovery and became healthy, but
the logs also contain missing-relation errors. Those are a separate schema
reconciliation issue tracked in `manual-migration-reconciliation/tasks.md`;
they are not evidence that WAL-to-Kafka integration is needed or authorized.
