# Temporal Action Ledger / DRY Agent Runtime

Status: **IMPLEMENTED_UNPROVEN**

This tranche adds durable procedural execution history without changing the owners of source-delta indexing, workflow identity, OpenSpec intent, result artifacts, or canonical graph truth.

## Ownership

```text
WorkflowActionEventV1
  canonical workflow/action identity owner
            │
            ▼
AgentActionEventV1
  immutable execution-history envelope
            │
            ├──► actions.jsonl
            │       append-only reference history
            │
            ├──► atlas_agent_action_events
            │       append-only Postgres durability implementation
            │
            ├──► ActionCurrentProjectionV1
            │       derived/rebuildable latest-state index
            │
            ├──► atlas.event.hypergraph.v1
            │       downstream temporal-event projection only
            │
            └──► ActionFeatureRowV1
                    derived recommendation features
```

Separate existing owner:

```text
temporal-indexing-fabric.ts
  source revision delta
  reparse / re-embed / Qdrant / graph recompute planning
```

The action ledger MUST NOT replace or duplicate that source-delta planner.

Result payloads remain in content-addressed artifacts/CAS-like stores. The action ledger stores `result_ref` / `artifact_refs`; it does not become the artifact byte store.

OpenSpec remains intended work. `OpenSpecActionLinkV1` links task revisions to observed runtime actions; `tasks.md` is not an execution log.

## Convergence decision — 2026-08-21

A repo audit found two independently developed temporal-action surfaces using the same logical schema name:

```text
packages/parent-atlas/src/core/temporal-action-ledger.ts
sveltekit-frontend/src/lib/server/atlas/temporal/agent-action-event-v1.ts
```

They are not wire-compatible. The package-level ledger is the convergence owner because it already preserves `WorkflowActionEventV1` identity, explicit revision authority, immutable event checksums, global ledger sequence, deterministic execution identity, JSONL reference replay, and fail-closed reuse semantics.

Therefore:

- `packages/parent-atlas` owns the temporal action contracts/runtime.
- The independent `agent/temporal-action-index-v1-20260821` contract must **not** be merged as another canonical `atlas.agent-action-event.v1` owner.
- SvelteKit may adapt/consume the package contract but must not redefine it.
- `atlas.event.hypergraph.v1` remains the existing event/hypergraph projection owner.
- Postgres is a durability implementation for immutable events, not a new workflow/action identity owner.
- `ActionCurrentProjectionV1` remains derived/rebuildable; V1 does not add a second canonical current-state table.

## Contracts

- **EVT-01** `AgentActionEventV1` — immutable action-history event.
- **EVT-02** `ActionOutcomeV1` — typed result vocabulary including exact/partial success, no-result, stale identity, parser/tool/timeouts, validator/typecheck/test failures, mutation rejection, policy rejection and cache hit.
- **TMP-01** `TemporalApplicabilityV1` — observed time plus optional valid-time interval and explicit workspace/source/graph revision coordinates with authority.
- **IDX-01** `TemporalActionIndexManifestV1` — event-log + derived-index artifact lineage.
- **IDX-02** `ActionCurrentProjectionV1` — latest state for one deterministic execution key.
- **DRY-01** `ExecutionReuseDecisionV1` — `HIT | RETRY | INVALIDATE | EXECUTE`.
- **OS-01** `OpenSpecActionLinkV1` — intended task revision ↔ observed action history.
- **REC-04** `ActionFeatureRowV1` — candidate next-action features, including expected information gain and historical utility.
- **REC-05** `NextActionRecommendationV1` — ranked next DAG-edge candidates.
- **REC-06** `RecommendationOutcomeReceiptV1` — whether the recommendation was followed and what happened.

## Deterministic ActionExecutionKey

The key is a canonical SHA-256 over semantic fields, not JSON serialization bytes:

```text
opcode
query_class
target canonical identity/resource
input_hash
implementation_revision
parameter_revision
context_manifest_hash
evidence_frontier_hash
relevant revision dimensions:
  dimension
  value
  authority
```

Wall-clock time is deliberately not part of the execution key.

`observed_at` orders historical observations but cannot make an old result applicable to a new world state.

## Revision fail-closed rule

An existing result is reusable only when every revision dimension declared relevant to that action is:

```text
authority = PROVEN
value != null
```

Current revision-owner proof state therefore remains an upstream gate. A matching hash with `source_revision.authority = UNPROVEN` MUST produce `INVALIDATE`, never `HIT`.

Do not infer revision authority from:

- content hashes,
- default `workspace_revision = 0`,
- populated pass-through columns,
- Qdrant payloads,
- symbol-version propagation,
- event timestamps.

The hypergraph adapter is stricter still because `atlas.event.hypergraph.v1` requires concrete workspace/source/representation revisions. It MUST:

- require PROVEN non-null workspace revision,
- require PROVEN non-null source revision,
- receive representation revision explicitly from its canonical owner,
- never substitute `parameter_revision` for representation revision,
- never write sentinel strings such as `UNPROVEN` into revision identity fields.

## DRY policies

### DRY-01 — successful exact execution

If the exact `ActionExecutionKey` has a latest applicable finalized successful result:

```text
HIT
REUSE_RESULT
EXACT_SUCCESS_REUSE
```

Do not execute the tool again.

### DRY-02 — exact known failure

If the exact applicable key has a finalized non-transient failure and no policy-authorized retry:

```text
HIT
SELECT_ALTERNATIVE
EXACT_FAILURE_DO_NOT_REPEAT
```

A failure hit is useful procedural evidence, not a cache miss.

Transient retries require an explicit retry policy, admitted outcome, and bounded retry count.

### DRY-03 — synthesis evidence frontier

`evidence_frontier_hash` participates in the execution key. A previous synthesis failure with an unchanged frontier is the same execution identity and should not be repeated. New exact evidence changes the frontier and therefore the execution key.

### DRY-04 — derived artifacts

Feature/materialization operations should include content-addressed dependency hashes in their `input_hash`. When dependencies and relevant revisions are unchanged, the successful result is reusable.

## Temporal semantics

`TemporalApplicabilityV1` separates:

```text
observed_at
  when Atlas learned/recorded the event

valid_time.from/to
  optional real-world/workspace validity interval

revision coordinates
  explicit identity of the relevant workspace/source/graph state
```

V1 does not implement a full bitemporal database. The fields are present so later storage can support known-at-time versus valid-at-time queries without changing event identity semantics.

## Durable Postgres implementation

Manual migration:

```text
sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_events.sql
```

Repository:

```text
packages/parent-atlas/src/core/temporal-action-postgres-repository.ts
```

The table stores immutable `AgentActionEventV1` JSON plus indexed projection columns. `event_id` is the event key and `ledger_sequence` is globally unique for V1. Duplicate `event_id` insertion is idempotent only after persisted JSON is parsed and its checksum is recomputed successfully. A conflicting or tampered row fails readback.

Indexed lookup surfaces include:

```text
execution_key
target_canonical_id
opcode
outcome
error_code
workspace_revision + source_revision + graph_revision
workflow_id + workflow_revision + action_id
```

`currentByExecutionKey()` reads immutable rows and rebuilds `ActionCurrentProjectionV1`; it does not persist another current truth table.

## Action relations

Derived temporal graph edges may use:

```text
PRECEDES
DEPENDS_ON
RETRIED_AS
SUPERSEDED_BY
INVALIDATED_BY
PRODUCED
CONSUMED
VERIFIED_BY
FAILED_BECAUSE
```

They are historical/procedural relations and do not become application-domain graph truth.

## Recommendation boundary

Action recommendation ranks possible next operations, not documents.

Initial normalized feature surface:

```text
semantic_affinity
structural_affinity
query_class_affinity
historical_success_rate
last_failure_similarity
cache_hit_probability
expected_information_gain
execution_cost
latency
mutation_risk
token_savings
dependency_readiness
downstream_utility
```

A future low-rank shortlist may be called:

```text
TANG_INSPIRED_LOW_RANK_SHORTLIST
```

only with explicit marker:

```text
INSPIRED_ONLY_NOT_TANG_ALGORITHM
```

Parent Atlas does not claim Ewin Tang's recommendation algorithm unless its required sampling-access assumptions are separately implemented and proven.

## Reference durable layout

V1 reference runtime:

```text
graphify-events/<ledger>/
  actions.jsonl
  manifest.json
  indexes/
    action-latest.json
```

`actions.jsonl` remains the reference append-only history/oracle for parity work. PostgreSQL is a second durability implementation of the same immutable event contract, not a replacement identity owner.

`action-latest.json` is derived and rebuildable from the log. It is not canonical history.

The manifest already reserves future Arrow materializations:

```text
action_latest_arrow_ref
action_by_target_arrow_ref
action_by_opcode_arrow_ref
action_by_outcome_arrow_ref
action_by_error_arrow_ref
workspace_snapshot_map_arrow_ref
```

All are intentionally `null` in V1. Arrow materialization is a later acceleration proof and cannot change history ownership.

## Proof gates

- [ ] **ACT-01** Parent Atlas package build succeeds with temporal action contracts/runtime/Postgres repository exported.
- [ ] **ACT-02** Focused Vitest passes exact success reuse, exact failure avoidance, bounded transient retry, revision invalidation and evidence-frontier invalidation.
- [ ] **ACT-03** Filesystem roundtrip proves append-only sequence, unique event IDs, canonical event checksum verification, deterministic latest projection and lookup.
- [ ] **ACT-04** Tampered JSONL event is rejected by checksum verification.
- [ ] **ACT-05** Current revision-owner proof remains upstream; no `UNPROVEN` revision result may be reused.
- [ ] **ACT-06** Adapt one real `WorkflowActionEventV1` producer into the ledger without changing workflow/action identity ownership.
- [ ] **ACT-07** Materialize Arrow indexes from the same history and prove exact lookup parity with the JSON reference projection.
- [ ] **ACT-08** Attach one OpenSpec task revision to actual execution/verification/failure actions using `OpenSpecActionLinkV1`.
- [ ] **ACT-09** Feed historical action outcome aggregates into candidate `ActionFeatureRowV1` and compare deterministic full-scan recommendation against a future shortlist policy.
- [ ] **ACT-10** Only after ACT-01..09, evaluate ACE procedural lessons from the same execution receipts; ACE policy cannot rewrite action history.
- [ ] **ACT-PG-01** Apply `20260821_atlas_agent_action_events.sql` only in the intended test/non-production database and prove schema/readback before production adoption.
- [ ] **ACT-PG-02** Append one event, read it back, recompute `event_checksum`, and prove duplicate identical `event_id` is idempotent while tampered/conflicting content is rejected.
- [ ] **ACT-PG-03** Prove Postgres `currentByExecutionKey` has exact parity with the JSONL reference projection for a frozen event fixture.
- [ ] **ACT-HG-01** Prove finalized revision-qualified temporal action projects through the existing `atlas.event.hypergraph.v1` contract.
- [ ] **ACT-HG-02** Prove UNPROVEN workspace/source lineage and missing representation revision fail closed before hypergraph projection.
- [ ] **ACT-CONV-01** Prevent the incompatible Svelte-only `atlas.agent-action-event.v1` contract from becoming a second canonical owner; reconcile or retire that branch before merge.

## No production promotion in this tranche

The manual Postgres migration is supplied but **not applied** by this tranche. No production Postgres mutation, Valkey owner change, Graphify canonical write, task-file mutation, workflow owner replacement, Arrow promotion, ACE learning policy, or action-history migration is claimed as proven.
