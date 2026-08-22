# Temporal Action Alternative Execution Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum closes the policy loop between an exact known action failure and selection of the next DAG edge. It extends the existing package-owned temporal action ledger/recommendation runtime; it does **not** create another temporal event owner, workflow identity owner, recommendation owner, current-state owner, or graph owner.

## Ownership

```text
packages/parent-atlas
  AgentActionEventV1                 immutable procedural history
  ActionCurrentProjectionV1          derived/rebuildable state
  ActionFeatureRowV1                 derived recommendation features
  NextActionRecommendationV1         deterministic action ranking
  AlternativeActionSelectionV1       derived next-edge selection

sveltekit-frontend
  temporal-tool-execution-boundary   pre-side-effect DRY adapter
  temporal-action-alternative-boundary
                                     concrete call mapping + durable-history adapter
  tool-shim                          bounded executor orchestration only
```

The Svelte layer MUST NOT redefine action identity or recommendation semantics.

## ACT-EXEC-02 — deterministic SELECT_ALTERNATIVE execution

Implementation state: **IMPLEMENTED_UNPROVEN**

New package runtime:

```text
packages/parent-atlas/src/core/temporal-action-alternative-runtime.ts
packages/parent-atlas/src/core/temporal-action-alternative-runtime.spec.ts
```

New Svelte adapter/runtime proof surface:

```text
sveltekit-frontend/src/lib/server/atlas/temporal/temporal-action-alternative-boundary.ts
sveltekit-frontend/src/lib/server/atlas/temporal/temporal-action-alternative-boundary.spec.ts
sveltekit-frontend/src/lib/server/ai/tool-shim-temporal-alternative.spec.ts
```

### Hard exclusion invariant

An exact known failed `ActionExecutionKey` is not merely given a negative feature score. It becomes an execution-policy exclusion:

```text
SELECT_ALTERNATIVE
  failed_execution_key = K1

eligible next edges
  K2
  K3
  K4

K1 MUST NOT appear in the recommendation candidate set
K1 MUST NOT be selected again in the same alternative chain
```

`last_failure_similarity` remains useful for penalizing related routes, but feature scoring can never override the exact-key exclusion.

### Package selection path

`recommendAlternativeActionFromHistory()`:

1. validates candidate IDs and execution keys;
2. combines the failed key with previously excluded keys;
3. removes excluded executions before ranking;
4. builds `ActionFeatureRowV1` through the existing checksum-verifying historical compiler;
5. calls the existing `recommendNextActionsDeterministic()` owner;
6. returns `AlternativeActionSelectionV1` with the selected candidate/action key and full `NextActionRecommendationV1` receipt;
7. fails closed if no eligible candidate remains.

No Tang algorithm is activated. Policy remains `DETERMINISTIC_FULL_SCAN`.

## Durable recommendation history read

The existing Postgres repository now exposes a bounded `listRecentFinalized()` read.

Properties:

```text
state = FINALIZED only
LIMIT <= 5000
optional workflow_id scope
newest-first SQL scan
checksum verification on every row
oldest-first deterministic normalization before aggregation
```

The read is an acceleration/access path over the existing append-only `atlas_agent_action_events` history. It is not a second history owner.

Default history scope for alternative execution is `WORKFLOW`; `GLOBAL` must be requested explicitly.

## Concrete call identity gate

Each alternative candidate carries:

```text
ActionFeatureCandidateInputV1
execution_key
concrete { tool, args }
TemporalToolExecutionContextV1
```

Before ranking, the Svelte adapter proves:

```text
temporal.expected_tool == call.tool
buildTemporalToolInputHash(call) == temporal.descriptor.input_hash
buildActionExecutionKey(temporal.descriptor) == candidate.execution_key
```

A stale/mismatched tool argument object therefore cannot inherit another candidate's recommendation identity.

## Executor behavior

When `ctx.temporalAction` yields `SELECT_ALTERNATIVE`:

```text
no temporalAlternativePlan
  -> preserve typed SELECT_ALTERNATIVE short circuit

explicit temporalAlternativePlan
  -> bounded checksum-verified Postgres history read
  -> hard-exclude exact failed execution key
  -> package deterministic recommendation
  -> map selected candidate to concrete call
  -> replace ctx.temporalAction with selected edge's own temporal descriptor
  -> run selected call through the same DRY gate
  -> dispatch original tool implementation only if that selected edge is dispatchable
```

The executor accumulates failed execution keys into `excluded_execution_keys` and caps the alternative chain at 8 hops. Exceeding the cap fails closed with `TEMPORAL_ALTERNATIVE_HOP_LIMIT_EXCEEDED`.

The chain therefore cannot oscillate between exact known failures indefinitely.

## Revision authority

Alternative recommendation may use historical outcomes as procedural features, but result reuse remains governed by the existing revision fail-closed rule.

An alternative edge's own `TemporalToolExecutionContextV1` must carry the real revision coordinates/authority supplied by an upstream owner. The alternative selector does not copy revision coordinates from the failed action and does not infer them from:

- timestamps,
- query hashes,
- user/session IDs,
- candidate IDs,
- historical success rates.

Every selected edge is run through `decideExecutionReuse()` independently before its side effect.

## Focused tests written

Package tests cover:

- exact failed key excluded even when it would otherwise score highest;
- evidence-first `RG_SEARCH` ranks ahead of expensive failed synthesis;
- tampered historical event checksum rejected;
- all candidates excluded => fail closed.

Postgres repository tests cover:

- bounded finalized read;
- optional workflow filter;
- deterministic ledger ordering;
- defensive rejection of non-finalized rows.

Svelte adapter tests cover:

- package winner maps back to the expected concrete tool call;
- candidate execution-key mismatch rejected;
- concrete argument/input-hash drift rejected;
- adapter requires an actual `SELECT_ALTERNATIVE` disposition.

Tool-shim orchestration test covers:

- failed edge -> deterministic replacement edge -> replacement DRY gate -> concrete tool dispatch;
- failed key is included in the next exclusion set;
- no-plan behavior remains the typed non-dispatch `SELECT_ALTERNATIVE` result.

All tests remain **WRITTEN_UNPROVEN** until executed on the workstation/CI.

## Proof gates

- [ ] **ACT-EXEC-02A** Package build exports `AlternativeActionSelectionV1` and alternative runtime with zero type errors.
- [ ] **ACT-EXEC-02B** Focused package tests prove exact failed-key exclusion and checksum/tamper behavior.
- [ ] **ACT-EXEC-02C** Bounded Postgres history read returns only checksum-valid finalized events in deterministic order.
- [ ] **ACT-EXEC-02D** Svelte candidate adapter proves tool/input/execution-key identity before selection.
- [ ] **ACT-EXEC-02E** First real known failure selects and dispatches a different deterministic DAG edge without an intervening LLM replan.
- [ ] **ACT-EXEC-02F** Two known failures cannot oscillate; prior failed keys remain excluded across the chain.
- [ ] **ACT-EXEC-02G** Hop-limit receipt proves fail-closed behavior after 8 alternative selections.
- [ ] **ACT-EXEC-02H** Selected alternative with UNPROVEN relevant revision authority cannot reuse historical result.
- [ ] **ACT-EXEC-02I** Recommendation outcome is recorded through existing `RecommendationOutcomeReceiptV1` before policy-quality promotion.

## No production promotion in this tranche

No Postgres migration was applied by this implementation session. No generic agent route is automatically enrolled. No revision authority is minted. No Graphify canonical write, queue mutation, Qdrant mutation, Valkey owner change, task-file mutation, Arrow promotion, ACE learning update, or Tang-inspired shortlist is promoted.

Production activation remains gated on the existing ACT/ACT-PG/ACT-HG/ACT-EXEC proof sequence plus these ACT-EXEC-02 receipts.
