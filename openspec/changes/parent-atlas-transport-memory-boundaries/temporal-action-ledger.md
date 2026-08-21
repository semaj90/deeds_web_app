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
            ▼
actions.jsonl
  append-only reference history
            │
            ├──► ActionCurrentProjectionV1
            │       derived/rebuildable latest-state index
            │
            ├──► future Arrow indexes
            │       derived acceleration only
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

`actions.jsonl` is the append-only reference history.

`action-latest.json` is derived and rebuildable from the log. It is not canonical history.

The manifest already reserves:

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

- [ ] **ACT-01** Parent Atlas package build succeeds with the temporal action contracts/runtime exported.
- [ ] **ACT-02** Focused Vitest passes exact success reuse, exact failure avoidance, bounded transient retry, revision invalidation and evidence-frontier invalidation.
- [ ] **ACT-03** Filesystem roundtrip proves append-only sequence, unique event IDs, canonical event checksum verification, deterministic latest projection and lookup.
- [ ] **ACT-04** Tampered JSONL event is rejected by checksum verification.
- [ ] **ACT-05** Current revision-owner proof remains upstream; no `UNPROVEN` revision result may be reused.
- [ ] **ACT-06** Adapt one real `WorkflowActionEventV1` producer into the ledger without changing workflow/action identity ownership.
- [ ] **ACT-07** Materialize Arrow indexes from the same JSONL history and prove exact lookup parity with the JSON reference projection.
- [ ] **ACT-08** Attach one OpenSpec task revision to actual execution/verification/failure actions using `OpenSpecActionLinkV1`.
- [ ] **ACT-09** Feed historical action outcome aggregates into candidate `ActionFeatureRowV1` and compare deterministic full-scan recommendation against a future shortlist policy.
- [ ] **ACT-10** Only after ACT-01..09, evaluate ACE procedural lessons from the same execution receipts; ACE policy cannot rewrite action history.

## No production promotion in this tranche

No Postgres migration, Valkey owner change, Graphify canonical write, task-file mutation, workflow owner replacement, or action-history migration is authorized by this document.
