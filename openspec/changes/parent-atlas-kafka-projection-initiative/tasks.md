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

## Proposed: event workboard integration (2026-10-13)

Status: PROPOSED, unchecked. Does not change KAFKA-01..07. Derived from the event-workboard review (addendum EWB-01..10). Do not treat the SQLite prototype as authority.

Storage rule: canonical state and the event store are PostgreSQL 18. `claude-mem` and OpenCode use SQLite for their own tooling; that is not an Atlas authority and is not a precedent for this lane.

Current WAL state (read-only, 2026-10-13): `wal_level=replica`, 0 replication slots, 0 publications. Anything that needs logical decoding is blocked by KAFKA-05 and needs an approved restart.

- [ ] KAFKA-08 Transactional outbox in PostgreSQL. The existing `workflow_outbox` proof covers worker-command publication, not atomic publication of OpenSpec task transitions with a canonical task-state transaction. Reuse only after the transition owner and transaction boundary are identified; no `wal_level` change.
- [ ] KAFKA-09 Revision-bound event envelope for OpenSpec task transitions, source revisions and evidence receipts. `AtlasWorkEventV1` is a local contract prototype, not yet a production event producer; it still needs canonical task/evidence identity, immutable revision requirements and a verified event source.
- [ ] KAFKA-10 Durable inbox with idempotency, conflict/dead-letter handling and crash-safe acknowledgement. `AtlasWorkEventInbox` is currently Map-backed and process-local; its tests do not establish persistence or restart safety.
- [ ] KAFKA-11 Invalidation through the existing controller only. No production caller currently connects `AtlasWorkEventInbox` to controller reconciliation or BitFrost invalidation. Preserve the existing eligibility and ranking owners.
- [ ] KAFKA-12 Packet adapter reuses existing owners: `sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts`, `packages/atlas-core/src/policy-task-router.ts`, and `workstation-orchestrator.ts`. Verify a revision-qualified event-to-packet path before claiming integration; do not introduce a redundant packet builder.
- [ ] KAFKA-13 Agent completion adapter: explicit approval, write-set, lease, timeout and receipt. Never mark OpenSpec checked from model output. Maps EWB-07.
- [x] KAFKA-14 Local replay/acceptance fixtures: `atlas-work-event.spec.ts` covers envelope validation, replay, conflict, handler failure and forbidden payload cases. This is unit-level prototype coverage only, not durable inbox or production-delivery proof.
- [ ] KAFKA-15 WAL logical decoding (CDC) is deferred and BLOCKED. It requires an approved `wal_level=logical` change with restart, replication slots, publication definition, rollback plan and KAFKA-05 gates. Not required for KAFKA-08..14 outbox/inbox processing.
- [ ] KAFKA-16 Monte Carlo critical-path estimate first; learned or bandit controllers only after real execution receipts exist. Research only. Maps EWB-10.

## Proposed: inventory findings for LUTs, caches and acceleration (2026-10-13)

Status: PROPOSED, unchecked. Does not change KAFKA-01..16. Source: repo inventory of tracked code, read-only.

- [ ] KAFKA-17 Revision-qualified multi-hop traversal cache. No cache exists in `packages/parent-atlas/src/core/multi-hop-retrieval.ts`. Bounded k-hop results would be cached in BitFrost/Valkey with keys that include source, workspace and graph revisions, and never treated as evidence. Owner: BitFrost. Related: EWB-08.
- [ ] KAFKA-18 LUT owner consolidation. Several LUTs exist (`packet-class-lut-v1.ts`, `repair-lut-v1.mjs`, plus ad hoc maps in many scripts). Name one owner per table before adding another. Do not add a second class table.
- [ ] KAFKA-19 Verify the simdjson native addon on this machine. `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts` falls back to `JSON.parse`, so a missing addon fails silently. Record whether `tensorrt_bridge.node` is present and loads, with a receipt.
- [ ] KAFKA-20 Name the "Headroom" concepts distinctly in docs: context compression (`scripts/headroom-proxy.mjs`), resource headroom (`resource-headroom.mjs`), and GPU admission (`ExecutionHeadroomV1`). No external Headroom library is in use. Any Netflix-style dependency needs its own capability gap first.
- [ ] KAFKA-21 Pokémon/ROM-bank naming is framing only. Keep it out of data contracts. No code maps Pokédex IDs to identity.
- [ ] KAFKA-22 No named hash-map library is in use. Keys are `Map`/object keys, SHA-256 digests, and PostgreSQL btree/GIN indexes. Do not add a hash-map dependency without a measured gap.

## Controller and event-bridge recheck (2026-10-13; read-only)

- [x] Ran the existing `audit-openspec-execution-controller-v1.mjs` against the
      current generated workboard, directing all reports to
      `.tmp/atlas/execution-controller-20261013/`. It completed with
      `writesPerformed:false`: 11,729 inventoried tasks, 7,230 classified
      proven, 3,123 actionable, 1,276 waiting, and 100 deferred. The controller
      is an existing recommendation-only eligibility/blocker classifier; this
      run does not prove agent dispatch, task-state mutation, or completion
      admission.
- [x] Identified a concrete controller integration gap: it cannot establish
      dependency-ready execution because it has no task-bound verified-receipt
      join. The workboard does contain dependency declarations; the first audit
      had not yet counted or resolved those edges. See the 2026-10-13 recheck.
- [x] Traced the existing event surfaces. The OpenSpec Studio SSE route polls a
      report fingerprint every three seconds; it is not a durable task-change
      event inbox. The PostgreSQL/RabbitMQ task outbox durably enqueues worker
      commands, while the agent workflow event log records execution actions;
      neither inspected path currently demonstrates revision-qualified
      OpenSpec task-transition ingestion and reconciliation through the
      controller.
- [ ] Keep KAFKA-08..13 and the EWB bridge unchecked. KAFKA-14 covers local
      unit fixtures only; it does not establish durable delivery. Next implementation gate
      is to define the event envelope and idempotent inbox around existing
      canonical task/evidence owners, then make the consumer request controller
      reconciliation only. Preserve explicit approval, write-set, lease,
      independently validated proof receipt, and human-owned OpenSpec task
      completion. Do not introduce another task store or agent framework.

Evidence: scratch controller output
`.tmp/atlas/execution-controller-20261013/openspec-execution-controller-v1.json`,
`scripts/atlas/audit-openspec-execution-controller-v1.mjs`,
`sveltekit-frontend/src/routes/atlas/studio/openspec/events/+server.ts`,
`sveltekit-frontend/src/lib/server/queue/outbox.ts`, and
`sveltekit-frontend/src/lib/server/agent/action-writer.ts`. No OpenSpec ledger
state was inferred from the report, and no database, broker, agent, Qdrant,
Valkey, or model state was changed.

### Local transition-diff adapter (2026-10-13; partial, no durable delivery)

- [x] Added `task-transition-events-v1.ts`, a pure diff over validated
      `atlas.openspec.workboard.v1` snapshots. It reuses the existing task
      contract's unique `stableKey` and `blockHash`, and requires SHA-256
      source-file hashes for every task source. Deterministic event IDs are
      bound to the payload hash and before/after workboard revisions.
- [x] The adapter emits only `OBSERVATION_ONLY_RECONCILIATION_REQUEST`; event
      envelopes hard-code `writesPerformed:false` and include an explicit empty
      `evidenceRefs` list. Removed tasks are observations, never inferred
      completions. Focused tests pass 4/4; a self-diff of the actual generated
      workboard validated 11,729 tasks and 100 source-file hashes and emitted
      zero events.
- [ ] Keep KAFKA-09 and KAFKA-10 open: this local diff does not provide
      immutable Git/workspace revision authority, evidence receipt resolution,
      durable PostgreSQL inbox/outbox persistence, conflict/dead-letter
      handling, crash-safe acknowledgement, or runtime delivery. It compares
      generated OpenSpec task snapshots only; it does not yet observe arbitrary
      repository source edits or initiate agent execution.
- [ ] Before wiring delivery, reconcile the diff against the canonical
      task/evidence identity owner and make controller reconciliation consume
      only current, idempotently admitted events. Agent dispatch and task
      completion remain separate approval and proof gates.

### Event-envelope hardening and status correction (2026-10-13)

- [x] Payload checksums now use recursively key-sorted JSON; schema validation
      verifies the checksum and rejects forbidden keys at any nesting depth.
      The inbox validates the envelope before invoking its handler. Focused
      tests cover nested forbidden fields, nested-key order, checksum tampering
      and mutated envelopes.
- [ ] This hardening does not make `AtlasWorkEventInbox` durable or connect it
      to OpenSpec changes. The existing `workflow_outbox` is for worker tasks;
      no production caller of `AtlasWorkEventInbox` was found. KAFKA-08..12
      remain open pending canonical event ownership and durable delivery.

Evidence: `sveltekit-frontend/src/lib/server/queue/atlas-work-event.ts`,
`sveltekit-frontend/src/lib/server/queue/atlas-work-event-inbox.ts`, and
`sveltekit-frontend/src/lib/server/queue/atlas-work-event.spec.ts`. No database,
broker, cache, task-ledger or agent writes occurred.

### Controller scratch-output correction (2026-10-13)

- [x] A fresh configured report directory exposed an `ENOENT`: the controller
      attempted report writes before creating its output directory and fell
      back to a nested `staging` directory. It now creates the configured
      directory before writing. The controller test no longer pre-creates the
      directory and asserts there are no fallback writes or write failures.
- [x] Re-ran the current 11,729-task workboard to a fresh `.tmp` directory;
      `reportWriteFailures` is empty and `writesPerformed:false`. The original
      count treating checked boxes as proven is superseded by the proof-state
      correction below.

Evidence: `scripts/atlas/audit-openspec-execution-controller-v1.mjs`,
`scripts/atlas/audit-openspec-execution-controller-v1.test.mjs` (1/1), and
`.tmp/atlas/execution-controller-current-20261013-r2/`. No database, broker,
cache, agent or OpenSpec task-state writes occurred.

### Canonical task/evidence event seam audit (2026-10-13; read-only)

- [x] Identified existing identity/evidence owners to reuse. The evidence
      fabric derives `canonicalTaskRef` within authority/change scope and
      classifies duplicate/ambiguous task identities. `buildOpenSpecTaskCardV1`
      joins task source+line, block/task revision, source-file revision,
      workspace revision, canonical task ref, and verified receipt refs; it
      explicitly emits `canonicalAuthority:false`. Evidence receipts are
      checksummed and revision-bound; `PROVEN` requires an independent verifier
      and required readback.
- [x] Confirmed the two inspected outboxes are not OpenSpec transition sources.
      `workflow_outbox` requires a workflow run and is written atomically with
      workflow/task commands. `outbox_events` is written by the agent-action
      transaction under a UUID action aggregate. Neither transaction owns
      changes to Git-backed `openspec/**/tasks.md` files, so neither can provide
      atomic capture of those file transitions without a new, explicitly owned
      ingestion boundary.
- [ ] Next bridge step: reconcile changed task-card snapshots by unique
      `canonicalTaskRef`, task revision, source-file revision and workspace
      revision; resolve evidence refs only through the existing receipt
      verifier; then emit an observation that requests the existing controller
      to recompute. Keep file/Git revision as the event source, reject ambiguous
      task identities and stale evidence, and do not dispatch agents or mutate
      OpenSpec task state from the event consumer.

- [x] The pure snapshot-diff validator now rejects duplicate `stableKey` values
      instead of silently collapsing rows in its identity maps. Focused
      `task-transition-events-v1.spec.ts` validation passes 5/5. This is only
      ambiguity containment: events still lack a production caller, durable
      inbox, and a verified `canonicalTaskRef`/evidence binding.
- [x] The existing task-evidence join now rejects missing or duplicate
      `taskKey` values before building its admission map, preventing ambiguous
      keys from overwriting another task's evidence. It also rejects all
      admissions when distinct task keys claim the same `canonicalTaskRef`.
      Focused join tests pass 5/5; this does not close canonical receipt
      verification or production event delivery.

Evidence: `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs`,
`scripts/atlas/lib/openspec-task-card-v1.mjs`,
`sveltekit-frontend/src/lib/server/agent/action-writer.ts`,
`sveltekit-frontend/src/lib/server/agent/outbox-worker.ts`,
`sveltekit-frontend/drizzle/manual/workflow_orchestration_tables.sql`, and
`sveltekit-frontend/drizzle/schema.ts`. This was source/schema inspection only;
no database or broker access or mutations occurred.

Evidence: `sveltekit-frontend/src/lib/server/atlas/openspec-board/task-transition-events-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/openspec-board/task-transition-events-v1.spec.ts`
(4/4), and the scratch execution-controller receipt above. No database, broker,
agent, cache, task-ledger, or projection writes occurred.

### Checked-task proof-state correction (2026-10-13)

- [x] Corrected the read-only execution controller so a checked OpenSpec task
      is reported as `CHECKED_UNVERIFIED`, not `PROVEN`, unless a future
      revision-bound task receipt is joined and independently admitted. The
      controller currently receives no such per-task verified receipt join;
      its broad checked-task count was therefore not proof evidence.
- [x] Added a regression fixture confirming a `DONE` checkbox alone contributes
      zero to `summary.proven` and appears in `checkedUnverifiedTasks`.
- [ ] Keep durable event ingestion and agent dispatch open. This correction
      improves claim accuracy; it does not implement the event bridge.

### Dependency topology recheck (2026-10-13; read-only)

- [x] The current workboard contains 26 resolved dependency edges, and the
      existing `dependsOnTaskIds` resolve to task keys. The controller now
      reports graph topology separately from proof admission and detects
      unresolved references/cycles; a complete graph is labeled
      `DECLARED_DEPENDENCIES_PRESENT_RECEIPTS_UNADMITTED`, not ready.
- [x] The fresh run found 0 unresolved dependency edges and 0 cycles. It still
      cannot release dependent tasks because no task-bound independently
      verified receipt join is present in this controller input.
- [ ] Keep execution blocked on missing receipt admission; do not treat
      declaration or a checked prerequisite as proof of completion.

Evidence: `.tmp/atlas/execution-controller-20261013-proof-state/openspec-execution-controller-v1.json`,
`scripts/atlas/audit-openspec-execution-controller-v1.mjs`, and the extended
controller regression fixture.

### Fresh task snapshot and receipt-join recheck (2026-10-13)

- [x] Changed the controller default from the cached `docs/reports` workboard
      to the existing read-only `--task-snapshot-stdout` builder. An explicit
      snapshot path remains available for isolated fixtures. Regression tests
      cover both paths.
- [x] Audited the current task/evidence join to scratch. The current snapshot
      contains 11,801 tasks; all 11,801 task identities join uniquely, but
      0/11,801 evidence admissions pass and zero cards are proof-usable. The
      previous task-card corpus was generated on 2026-10-03 and is stale for
      this workspace.
- [x] Rejection counts include `DIAGNOSTIC_ONLY` 11,801,
      `NO_EXACT_VERIFIED_RECEIPT_BINDING` 11,801,
      `RECEIPT_SOURCE_FILE_REVISION_MISMATCH` 11,799, and
      `RECEIPT_TASK_REVISION_MISMATCH` 11,797. Counts are per-reason and may
      overlap; no receipt is promoted by this audit.
- [ ] Keep task completion and dependency release unadmitted until current,
      task-bound receipts pass the existing independent verifier. This blocks
      event-driven dispatch; a fresh workboard snapshot alone is not authority.

Evidence: `.tmp/atlas/execution-controller-20261013-current-task-evidence-join.json`
(readback checksum verified; `canonicalAuthority:false`,
`writesPerformed:false`), `scripts/atlas/audit-current-task-evidence-card-join-v1.mjs`,
and `docs/reports/openspec-task-cards-v1.json` (stale snapshot metadata).

### Controller receipt-admission bridge (2026-10-13)

- [x] Added the missing `taskRef` to each checksummed task-evidence admission
      record so the existing report can be joined to the controller without
      inferring identity from a point ID or task text.
- [x] Added an optional, fail-closed controller input for the current evidence
      join. It verifies report and row checksums, workspace HEAD, task snapshot
      checksum, source-file revision, task-block revision, unique taskRef,
      canonical-task reference, and nonempty evidence refs before any task can
      be labeled `PROVEN`. Dependency topology does not itself release tasks.
- [x] Regression coverage verifies exact admission and rejects stale workspace,
      changed task snapshots, invalid checksums, and revision mismatches.
- [ ] A preceding read-only join snapshot matched all 11,805 task identities,
      but admitted 0/11,805. Treat those counts as that snapshot only; current
      counts require rerunning the join after task-ledger changes. The event
      inbox remains a local prototype, not a durable production event source.

Evidence: `scripts/atlas/lib/openspec-task-card-v1.mjs`,
`scripts/atlas/lib/task-evidence-join-controller-v1.mjs`,
`scripts/atlas/audit-openspec-execution-controller-v1.mjs`,
`scripts/atlas/lib/task-evidence-join-controller-v1.test.mjs` (3/3), and the
current join/controller scratch receipts in `.tmp/atlas/`.

Evidence: `scripts/atlas/audit-openspec-execution-controller-v1.mjs`,
`scripts/atlas/audit-openspec-execution-controller-v1.test.mjs`.

### Event source and dependency gate recheck (2026-10-13)

- [x] Enforced declared prerequisite readiness in the existing controller.
      An actionable task now waits if any prerequisite is missing, lacks an
      admitted task-bound receipt, or participates in a dependency cycle.
      Checkbox state alone does not release a dependent task.
- [x] Extended the isolated controller regression fixture to cover a checked
      but unproven prerequisite, an unresolved prerequisite, and a cycle.
- [x] Re-inspected the event owners. The OpenSpec snapshot diff emits
      deterministic, observation-only events from hashed task-file snapshots,
      but no production watcher/producer was found. `AtlasWorkEventV1` permits
      optional workspace/source revisions and has no canonical task reference;
      the separate observation event carries task keys and file revisions but
      is not connected to durable ingestion. `workflow_outbox` is coupled to
      workflow runs and commands, not Git-backed task-file transitions.
- [ ] Keep the durable event source/inbox and dispatch unimplemented until
      the source event producer, canonical task identity binding, and durable
      persistence/acknowledgment owner are established. Reconciliation may
      request a fresh controller snapshot; it must not mutate task state.

Evidence: `scripts/atlas/audit-openspec-execution-controller-v1.mjs`,
`scripts/atlas/audit-openspec-execution-controller-v1.test.mjs`,
`sveltekit-frontend/src/lib/server/atlas/openspec-board/task-transition-events-v1.ts`,
`sveltekit-frontend/src/lib/server/queue/atlas-work-event.ts`,
`sveltekit-frontend/src/lib/server/queue/atlas-work-event-inbox.ts`, and
`sveltekit-frontend/drizzle/manual/workflow_orchestration_tables.sql`.
Source inspection only; no database, broker, agent, cache, or task-state writes.


### Empirical Valkey Live Audit & Ewin Tang / Low-Rank Readback (2026-10-13)

- [x] Audited live Valkey cache (`legal-ai-valkey:6379`, 218 total keys). Verified actual key distribution:
  - `keys "*centroid*"`: **0 keys**. Centroid caching is theoretical; no live centroids exist in cache.
  - `keys "*hll*"`: **0 keys**. HyperLogLog cardinality telemetry is not populated in live cache.
  - `keys "*tang*"` / `"*ewin*"`: **0 keys**. Ewin Tang low-rank recommendation states are not persisted.
  - `keys "ace:*"`: **12 keys** total (`ace:chunk:hits:*` [11 keys], `ace:reward:queue` [1 key]). Zero `ace:packet:*` keys exist.
  - `keys "bitfrost:*"`: **1 key** (`bitfrost:summary:index:ranked:v1`).
  - `keys "embed:*"`: **5 keys** (`embed:embeddinggemma:latest:*` [4], `embed:v2:embeddinggemma:latest:*` [1]).
  - Remaining ~200 keys belong to BullMQ job queues (`bull:trace-upsert:*`, `bull:posthog-integration-queue:*`) and Drizzle table metadata (`drizzle:tbl:*`).
- [x] Audited Ewin Tang / low-rank recommendation implementation:
  - `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts` implements `sampleQueryAdaptiveCandidates()` as a deterministic heuristic (`TANG_INSPIRED_LOW_RANK_SHORTLIST`), explicitly stamped `exactPromotionRequired: true` and `canonicalWrites: false`.
  - Design literature (arXiv:1807.04271) requires special $\ell_2$-norm sampling access to a near-low-rank matrix; it is an offline challenger and does not replace exact PostgreSQL 18 or Qdrant dense retrieval.
- [x] Dense search and prompt engineering over the OpenSpec Workboard (11,801 tasks; >3k actionable):
  - Agentic next-step search must use bounded Top-K pagination (`sveltekit-frontend/src/lib/server/retrieval/topk-paginator.ts`) and deterministic CSR traversal cursors (`sveltekit-frontend/src/lib/server/atlas/graph/csr-traversal-cursor.ts`).
  - Raw unranked task hit injection into LLM prompts is strictly blocked. Prompts route exclusively to local `llama-server:8090` (`ornith-1.5-9b`).
  - Tasks with unadmitted prerequisites remain blocked under `TASK_LEDGER_DEPENDENCY_RECEIPTS_NOT_DECLARED`.

### Current task/evidence join and controller replay (2026-10-13; scratch-only)

- [x] Rebuilt the current task/evidence join under `.tmp/` and independently
      read it back at HEAD `a3385714213222f90a37d4cb997b56e28fd3b7e3`, workspace
      revision `sha256:0da99fb6f0a5d89deab7533acf6d6a2a662a404c50bdd7e9cf1aaaf855abab40`.
      All 11,818 task/card references joined one-to-one, but 0/11,818 claims
      were admitted and 0 EvidenceCards were proof-usable. Every admission
      candidate had `NO_EXACT_VERIFIED_RECEIPT_BINDING`; 11,816 also had
      `RECEIPT_SOURCE_FILE_REVISION_MISMATCH`, and 11,814 had
      `RECEIPT_TASK_REVISION_MISMATCH`.
- [x] Fed that exact join report to the read-only execution controller. The
      fresh 11,818-task projection reported 0 proven, 3,168 heuristic
      actionable, 1,282 waiting, and `writesPerformed:false`. The actionable
      count is not dispatch authorization. No task-bound receipt was available
      to promote a claim, so event-triggered agent dispatch and cache warming
      remain blocked.
- [ ] Repair receipt production/binding for one exact task block and complete
      task-file revision, independently read it back, then rerun the join and
      controller before connecting any event consumer. These reports describe
      the pre-ledger-edit workspace snapshot and must not be reused as current
      after this ledger change.

Receipts: `.tmp/atlas/workboard-event-bridge-20261013/task-evidence-join.json`
and `.tmp/atlas/workboard-event-bridge-20261013/controller/openspec-execution-controller-v1.json`.
The join checksum is `sha256:9d080b5461efcfee9aadaf45f1dd41ac5212268633f5a81e00e580fbe1bff75c`;
both outputs report `canonicalAuthority:false` and `writesPerformed:false`.

### KAFKA-14 scratch receipt follow-up (2026-10-13; unpublished)

- [x] Re-ran `KAFKA-14` focused tests and built a task-scoped scratch receipt
      candidate using the exact task block, current task-file revision, two
      source spans, test-output checksum, and workspace revision
      `sha256:75414d61cf62bb2d98c0370ff7f5179db78cbd8822913310f00c72ea8e442c23`.
      Receipt readback matched (`SCRATCH_RECEIPT_READBACK_MATCH`), but its
      verdict is `PARTIAL`, publication scope is `SCRATCH_ONLY`, and the
      canonical census did not discover it. This demonstrates candidate
      construction, not task admission or durable event delivery.
- [x] Rebuilt the join after that scratch candidate at the same workspace
      revision: 11,821 tasks, 0 admitted receipts, and 0 proof-usable cards.
      Every candidate still has `NO_EXACT_VERIFIED_RECEIPT_BINDING`; the
      controller reports 0 proven and 3,169 heuristic actionable tasks.
      The scratch candidate does not change canonical admission. These reports
      describe the pre-ledger-edit snapshot.

Receipts: `.tmp/atlas/workboard-event-bridge-20261013/kafka14-scratch-receipt.json`,
`.tmp/atlas/workboard-event-bridge-20261013/task-evidence-join-after-scratch.json`,
and `.tmp/atlas/workboard-event-bridge-20261013/controller-after-scratch/openspec-execution-controller-v1.json`.
Scratch receipt ID `receipt:parent-atlas-kafka-projection-initiative:KAFKA-14:scratch:342117376920b4124ff9b289`;
checksum `sha256:2a5520b4b8c28b8963220db80be2e1a3571cfe934720e3a7ca31381aab06b5e1`.
No publication, database, broker, cache, agent, or task-state write occurred.

### KAFKA-14 publisher-owner census (2026-10-13; read-only)

- Inspected the task-scoped symbol-span, tree-node identity, ACE assembler,
  and task-triage receipt generators. They write task-specific report files;
  their outputs explicitly deny canonical authority or mutation authorization.
  The generic task-scoped receipt helper emits `SCRATCH_ONLY` candidates and
  verifies publication by reading the evidence census; it does not publish.
- No inspected owner provides an authorized generic publisher for a
  KAFKA-14 task receipt. The triage generator is not a substitute: it writes
  report artifacts, declares `canonicalAuthority:false` and
  `mutationAuthorized:false`, and its receipt readback has previously failed.
- A broader source search found fixed-purpose receipt generators, including
  `record-agentic-completion-agent-09-fixture-receipt-v1.mjs` and
  `record-graph-identity-contracts-receipt-v1.mjs`. They write scoped report
  files that the evidence census can read; one is explicitly `PARTIAL`, and
  neither implements a reusable KAFKA task-transition publisher. Thus the
  finding is not “the repository has no receipt writers”; it is that no
  authorized generic publisher or KAFKA-14-specific publication owner was
  identified in this bounded search.
- Keep KAFKA-14's local test evidence and scratch receipt non-admitted. Do not
  copy it into canonical evidence paths or change task state. Durable receipt
  publication remains blocked on identifying an existing authorized owner and
  its revision-bound write/readback contract; no new publisher was introduced.

### KAFKA-09 snapshot-diff correction (2026-10-13; local test only)

- [x] Fixed the OpenSpec snapshot diff to compare task key, change ID, source
      path, line, state, and execution state in addition to `blockHash`. The
      prior fast path could omit a state-only change or task-key change when
      the block hash stayed the same. The focused observation-event test passes
      7/7; the combined transition and envelope suites pass 15/15.
- [ ] This remains a pure observation diff. It does not establish canonical
      task identity, a durable event source/inbox, authorized receipt
      publication, controller reconciliation, dispatch, or task completion.
      Keep KAFKA-09..13 open.

### KAFKA-09 task identity/source binding trace (2026-10-13; read-only)

- The observation event now carries separate before/after source paths,
  `path#Lline` locators, and corresponding file revisions for task changes.
  Focused transition and envelope suites pass 16/16. This preserves the exact
  source location when a task moves; these locators are not canonical IDs.
- The evidence-fabric owner constructs `canonicalTaskRef` as
  `openspec-task:<authorityScope>/<changeId>/<ledgerId-or-derivedTaskKey>`.
  The separate identity-recovery owner emits a collision-checked
  `canonicalTaskKey`. Neither value is interchangeable with the observation
  event's `taskKey`, `stableKey`, or `path#Lline` source locator.
- KAFKA-09 remains open until an existing owner joins event source refs to the
  evidence-fabric `canonicalTaskRef` using current task/source/workspace
  revisions. Do not infer or synthesize this binding from a workboard key.

### KAFKA-09 exact identity resolver readback (2026-10-13; diagnostic only)

- [x] Tightened identity admission so nested `taskIdentity.identityState` values
  `AMBIGUOUS`, `INVALID`, or `CONFLICTING` cannot be masked by a top-level
  `DECLARED_ID`/`DERIVED_ID`; added a regression test for that precedence case.
- [x] Built the current evidence-fabric census in memory and resolved one exact
  current task source reference, task block hash, source-file revision, and
  `canonicalTaskRef`. The census contained 12,663 task rows and reported
  `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`; the resolver returned
  `BOUND_TO_CURRENT_TASK`, while `canonicalAuthority`, `dispatchAuthorized`,
  and `writesPerformed` remained false.
- This used a synthetic observation envelope to exercise the exact current
  census binding. It does not prove a production event producer, durable inbox,
  independent event readback, task-state mutation, or dispatch. KAFKA-09..13
  remain open; no task state or persistent store was changed.

Validation: transition/event focused suites passed 19/19; strict OpenSpec
validation and `git diff --check` passed. Census and resolver output were
stdout-only; no receipt or report was written.

### KAFKA-08 existing outbox suitability recheck (2026-10-13; source inspection)

- `public.outbox_events` is not yet a safe generic OpenSpec transition inbox.
  Its declared key is generated `outbox_id`; the inspected schema has no unique
  event-id/idempotency constraint or consumer-specific acknowledgment state.
  Its `aggregate_id` is UUID-shaped and does not directly represent the
  source-revision-qualified task identity.
- The existing `agent/outbox-worker.ts` claims unpublished rows and routes
  recognized event types to Redis centroid/ACE handlers, Qdrant embedding
  projection, or acquisition-stream publishing. Reusing it for a task
  transition without a separate consumer boundary could trigger projection
  side effects unrelated to controller reconciliation. The current worker
  contract is fanout, not an idempotent task-event inbox.
- Therefore KAFKA-08..10 remain open. Do not write task observations into this
  table or add a worker handler until an authorized event owner, idempotency
  key/storage contract, acknowledgment semantics, and side-effect isolation
  are established. This was source inspection only; no live schema query or
  database/broker/cache operation was performed.

Evidence: `sveltekit-frontend/drizzle/0038_deep_research_tables.sql`,
`sveltekit-frontend/drizzle/schema.ts`,
`sveltekit-frontend/src/lib/server/agent/outbox-worker.ts`,
`sveltekit-frontend/src/lib/server/agent/action-writer.ts`, and
`sveltekit-frontend/drizzle/manual/20260802_outbox_events_stream_publish.sql`.

### KAFKA-09 observation-envelope integrity check (2026-10-13; local)

- [x] The identity resolver now recomputes `payloadHash` from the event payload,
  recomputes `eventId` from the schema and payload hash, and rejects any
  observation envelope carrying evidence refs. A tampered payload with stale
  hashes returns `EVENT_CHECKSUM_MISMATCH` before census binding.
- This protects the pure adapter against accidental/tampered envelope changes;
  it does not authenticate a producer, persist events, or establish a durable
  event source. KAFKA-09..10 remain open.

Validation: `task-transition-events-v1.spec.ts` passed 12/12; strict OpenSpec
validation and `git diff --check` passed. No stores were accessed or changed.

### KAFKA-09 change-owner binding (2026-10-13; local)

- [x] The observation resolver now requires the evidence-census task row's
  `changeId` and rejects an event whose `changeId` differs, even when its
  source reference, task block hash, and source-file revision match. The
  regression constructs a checksum-valid event with a conflicting change ID
  and verifies `TASK_CHANGE_ID_MISMATCH`.
- The transition/event focused suites pass 21/21; strict OpenSpec validation
  and `git diff --check` pass. This remains local contract proof only; no
  producer authentication, durable delivery, or dispatch is established.

### Live workboard / TRACE recheck (2026-10-13; operator-reported, read-only)

- The current controller report is `0 proven`, `3,168 actionable`, and `1,282
  waiting`; the dependency gate still blocks prerequisites that are missing,
  unproven, or cyclic. These are eligibility projections, not authorization to
  dispatch agents or warm caches.
- Reported health is degraded: topology `:8101` and reranking `:8099` are down;
  native SIMDJSON reports `NATIVE_BACKEND_UNAVAILABLE`; Redis responds `PONG`.
  Redis reachability alone does not establish cache-key presence or validity.
- A bounded Atlas packet search returned results, while the `source_ref` query
  timed out at statement timeout. A returned canonical packet summary reportedly
  contains model-drafting scratch text; treat this as a packet-quality defect,
  not a reason to write or overwrite a packet during this review.
- The requested TRACE centroid/HLL follow-up was still running at handoff. The
  earlier ledger census found no centroid/HLL or `ace:packet:*` keys, but it is
  not a fresh read for this recheck. Do not claim current absence/presence until
  that bounded read completes.
- `context_build_ace_packet` was intentionally skipped because it writes to
  Redis. No packet generation, centroid/HLL mutation, cache warming, task
  dispatch, or service restart occurred. Graphify refresh also remains outside
  this read-only audit.

Next: obtain the pending bounded TRACE key census; separately repair the
statement-timeout query and packet-summary validator through their existing
owners. Keep the controller/event bridge observation-only until exact task and
evidence revisions reconcile and independently verified receipts exist.
