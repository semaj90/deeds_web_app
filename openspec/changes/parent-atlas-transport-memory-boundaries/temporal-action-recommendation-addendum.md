# Temporal Action Recommendation Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum extends the package-owned temporal action ledger. It does not create a second event owner, current-state owner, recommendation truth owner, or OpenSpec execution log.

## Added runtime

```text
packages/parent-atlas/src/core/temporal-action-recommendation-runtime.ts
packages/parent-atlas/src/core/temporal-action-recommendation-runtime.spec.ts
sveltekit-frontend/src/lib/server/atlas/temporal/temporal-tool-execution-boundary.ts
sveltekit-frontend/src/lib/server/atlas/temporal/temporal-tool-execution-boundary.spec.ts
```

The package export surface exposes the recommendation runtime through `packages/parent-atlas/src/index.ts`.

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

## ACT-EXEC-01 — pre-tool temporal DRY boundary

Implementation state: **IMPLEMENTED_UNPROVEN**

The live LangGraph tool path is:

```text
langgraph-dag.ts
  -> executeTool(call, ctx)
  -> temporal-tool-execution-boundary.ts   when ctx.temporalAction is present
  -> build existing ActionExecutionKey
  -> Postgres currentByExecutionKey
  -> existing decideExecutionReuse
  -> disposition
       REUSE_RESULT
       SELECT_ALTERNATIVE
       DISPATCH_RETRY
       DISPATCH_RECOMPUTE
       DISPATCH_EXECUTE
  -> original tool implementation only for DISPATCH_* dispositions
```

This is intentionally an executor seam, not another action contract. It consumes the package-owned `ActionExecutionDescriptorV1`, `ActionCurrentProjectionV1`, `ExecutionReuseDecisionV1`, retry policy and Postgres repository.

`buildTemporalToolInputHash()` binds reuse to the exact tool name + exact tool arguments. `buildTemporalToolExecutionContext()` computes that hash from the concrete call while requiring the producer to supply all revision coordinates and authority explicitly from their real owners.

Temporal mode is opt-in through `ctx.temporalAction` until revision-owner/runtime proof is complete. Legacy tool callers remain unchanged when no temporal context is supplied.

Once temporal mode is supplied, the boundary is fail-closed:

```text
history lookup failure
schema mismatch
expected tool mismatch
input hash mismatch
missing reusable result_ref

=> do not silently fall through to tool execution
```

An exact finalized success becomes `REUSE_RESULT` and the underlying tool is not called. An exact finalized non-retryable failure becomes `SELECT_ALTERNATIVE` and the underlying tool is not called. A bounded retry, invalidated world state, or new execution remains dispatchable under the existing DRY policy.

The generic agent chat route is not automatically enrolled because it does not currently carry canonical workspace/source revision authority. Query hashes, user IDs, session IDs and timestamps are not accepted as revision owners.

The distributed agent worker already forwards its `ctx` payload into `runAgentDAG()`, so an authoritative workflow producer can carry the temporal context through the existing transport without the worker minting revision authority.

ACT-EXEC-01 cannot be marked PROVEN until a real revision-qualified workflow action demonstrates:

```text
first delivery
  no history -> DISPATCH_EXECUTE -> tool runs -> durable FINALIZED event

second identical delivery
  exact PROVEN revisions -> REUSE_RESULT or SELECT_ALTERNATIVE -> tool does not run

changed relevant revision
  changed execution key / invalidation -> tool may run

UNPROVEN relevant revision
  never REUSE_RESULT
```

## Safety / authority boundary

This tranche does not change the revision fail-closed rule.

Cross-session result reuse still requires all relevant revision coordinates to be `PROVEN` and non-null. Historical recommendation features may summarize past outcomes, but they cannot convert `UNPROVEN` revision lineage into reusable truth.

No production Postgres migration, queue mutation, Qdrant mutation, Valkey mutation, Graphify canonical write, task-file mutation, Arrow index promotion, ACE learning update, or automatic enrollment of unqualified tool calls is authorized by this addendum.

## Next proof order

1. Run package build and focused temporal ledger/recommendation Vitest suites.
2. Run the focused `temporal-tool-execution-boundary.spec.ts` plus existing `tool-shim.spec.ts` legacy-compatibility proof.
3. Run filesystem JSONL checksum/replay proof.
4. Apply the manual action-ledger migration only in the intended non-production database.
5. Prove Postgres append/readback/idempotency and JSONL ↔ Postgres `ActionCurrentProjectionV1` parity.
6. Prove the hypergraph adapter on a real finalized action with PROVEN workspace/source and explicit representation revision.
7. Link one real OpenSpec task revision through `OpenSpecActionLinkV1` and read it back.
8. Build historical aggregates from that frozen action corpus and generate `NextActionRecommendationV1`.
9. Record `RecommendationOutcomeReceiptV1` after execution.
10. Run one real revision-qualified tool action through ACT-EXEC-01 twice and prove the second identical delivery does not call the tool.
11. Only after those receipts pass should automatic temporal enrollment, policy-quality evaluation, Arrow action indexes, ACE procedural lessons, or a Tang-inspired shortlist experiment begin.
