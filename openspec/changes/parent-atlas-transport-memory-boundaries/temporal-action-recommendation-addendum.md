# Temporal Action Recommendation Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum extends the package-owned temporal action ledger. It does not create a second event owner, current-state owner, recommendation truth owner, or OpenSpec execution log.

## Added runtime

```text
packages/parent-atlas/src/core/temporal-action-recommendation-runtime.ts
packages/parent-atlas/src/core/temporal-action-recommendation-runtime.spec.ts
```

The package export surface now exposes this runtime through `packages/parent-atlas/src/index.ts`.

## ACT-08 — OpenSpec task/action linkage

Implementation state: **IMPLEMENTED_UNPROVEN**

`compileOpenSpecActionLink()` consumes a checksum-verified `AgentActionEventV1` and emits the existing `OpenSpecActionLinkV1` contract.

It enforces outcome semantics:

```text
EXECUTED_BY
  may point to any checksum-valid action event

VERIFIED_BY
  requires FINALIZED successful outcome

FAILED_BY
  requires FINALIZED non-success outcome

SUPERSEDED_BY
  requires SUPERSEDED state/outcome
```

The resulting link carries the real workflow `action_id`, deterministic `execution_key`, source action `event_id`, source evidence refs and the explicit OpenSpec task revision.

This remains a projection/link only. It does not mutate `tasks.md` and OpenSpec remains intended work state.

ACT-08 cannot be marked PROVEN until one real OpenSpec task revision is linked to actual durable execution/verification/failure events and read back.

## ACT-09 — historical action features and deterministic recommendation

Implementation state: **IMPLEMENTED_UNPROVEN**

`aggregateHistoricalActions()` verifies every immutable event checksum before using history and computes revision-independent historical aggregates for one:

```text
opcode
query_class
target_class
```

including:

```text
finalized_attempts
success_count
exact_success_count
failure_count
no_result_count
cache_hit_count
historical_success_rate
cache_hit_probability
mean_latency_ms
mean_tokens
latest_outcome
latest_failure_error_code
```

`compileActionFeatureRowFromHistory()` then populates the existing `ActionFeatureRowV1` fields from the aggregate plus current candidate evidence. Missing history remains explicit zero historical evidence rather than fabricated success.

A matching prior failure error code produces `last_failure_similarity=1`, allowing the next-action policy to penalize repeating a known failed route.

`recommendNextActionsDeterministic()` performs the current full-scan challenger ranking. It favors evidence fit, structural affinity, historical success, cache probability, information gain, dependency readiness and downstream utility while penalizing execution cost, latency, mutation risk and repeated-failure similarity.

The policy remains:

```text
DETERMINISTIC_FULL_SCAN
```

No Tang algorithm claim is made and no low-rank shortlist is activated.

Focused tests include the desired procedural behavior:

```text
cheap structural RG_SEARCH
+ high historical success
+ high information gain

ranks ahead of

expensive early SYNTHESIZE
+ prior NO_RESULT
+ high latency/cost
```

ACT-09 cannot be marked PROVEN until the runtime consumes a frozen durable action-history fixture and its recommendation receipt is compared against observed downstream execution outcomes.

## Safety / authority boundary

This tranche does not change the revision fail-closed rule.

Cross-session result reuse still requires all relevant revision coordinates to be `PROVEN` and non-null. Historical recommendation features may summarize past outcomes, but they cannot convert `UNPROVEN` revision lineage into reusable truth.

No production Postgres migration, queue mutation, Qdrant mutation, Valkey mutation, Graphify canonical write, task-file mutation, Arrow index promotion, ACE learning update, automatic tool dispatch or recommendation-following behavior is authorized by this addendum.

## Next proof order

1. Run package build and focused temporal ledger/recommendation Vitest suites.
2. Run filesystem JSONL checksum/replay proof.
3. Apply the manual action-ledger migration only in the intended non-production database.
4. Prove Postgres append/readback/idempotency and JSONL ↔ Postgres `ActionCurrentProjectionV1` parity.
5. Prove the hypergraph adapter on a real finalized action with PROVEN workspace/source and explicit representation revision.
6. Link one real OpenSpec task revision through `OpenSpecActionLinkV1` and read it back.
7. Build historical aggregates from that frozen action corpus and generate `NextActionRecommendationV1`.
8. Record `RecommendationOutcomeReceiptV1` after execution; only then begin policy-quality evaluation or a Tang-inspired shortlist experiment.
