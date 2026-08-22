# Temporal Recommendation History Addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche closes the package-level policy-feedback seam after `RecommendationOutcomeReceiptV1` durability. It does not create another temporal action owner, recommendation owner, workflow identity, retrieval ranker, or graph truth path.

## Ownership

```text
AgentActionEventV1
  -> HistoricalActionAggregateV1
  -> how the action behaved

NextActionRecommendationV1
  + RecommendationOutcomeReceiptV1
  -> HistoricalRecommendationAggregateV1
  -> how the policy behaved when selecting an action
```

These aggregates answer different questions and remain separate.

`HistoricalRecommendationAggregateV1` is explicitly:

```text
observational_only = true
causal_claim = false
```

A successful downstream result after a selection is evidence about policy performance. It is not proof that the recommendation caused the result.

## Added runtime

```text
packages/parent-atlas/src/core/
  temporal-recommendation-history-runtime.ts
  temporal-recommendation-history-runtime.spec.ts
  temporal-recommendation-feature-runtime.ts
  temporal-recommendation-feature-runtime.spec.ts
  temporal-action-alternative-feedback.spec.ts
```

`temporal-action-alternative-runtime.ts` now accepts optional revision-scoped recommendation observations. Existing callers that omit them retain the existing action-history-only behavior.

## HistoricalRecommendationAggregateV1

For one `candidate_action_id + policy_family + policy_revision + feature_revision`, the aggregate records:

```text
recommendation_count
selection_count
execution_count
downstream_observation_count
success_after_selection_count
failure_after_selection_count
authoritative_outcome_count
authoritative_success_count
followed_recommendation_count
selection_rate
execution_after_selection_rate
downstream_success_rate
followed_recommendation_rate
latest recommendation/execution/outcome observation
evidence_refs
aggregate_checksum
```

The runtime fails closed on:

- receipt/recommendation ID mismatch,
- selected action absent from recommendation,
- `followed_recommendation` drift,
- selected execution-key drift,
- observed outcome without an execution key,
- policy-family drift,
- policy-revision drift,
- feature-revision drift.

An unselected candidate never inherits the selected candidate's downstream result.

## Feature-learning boundary

Recommendation history may update **only** `ActionFeatureRowV1.downstream_utility`.

It may not alter:

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
canonical identity / execution identity
```

The update rule is deterministic and bounded:

```text
updated_downstream_utility
  = (prior_downstream_utility + observed_success_count)
    / (1 + downstream_observation_count)
```

The prior therefore has weight 1. The rule is intentionally a simple observational policy signal, not a causal estimator or learned model.

## Closed-loop negative fixture

The focused feedback fixture freezes the procedural-memory behavior:

```text
K1 exact known failure
  -> hard excluded

K2 initially ranks first
  -> selected
  -> executed
  -> downstream failure receipt
  -> repeated downstream failure receipt

next deterministic selection
  -> K1 remains excluded
  -> K2 downstream utility decreases
  -> K3 may overtake K2
```

This is the important negative-learning invariant:

```text
selected != successful
```

and:

```text
SELECTED + EXECUTED + FAILURE
  -> valid negative policy evidence
  -> never rewritten as positive action history
```

## Proof gates

- [ ] **ACT-REC-HIST-01** recommendation/receipt identity and execution-key validation passes.
- [ ] **ACT-REC-HIST-02** aggregate rates are deterministic and checksum-stable.
- [ ] **ACT-REC-HIST-03** unselected candidates receive no downstream outcome.
- [ ] **ACT-REC-HIST-04** policy/feature revision drift fails closed.
- [ ] **ACT-REC-HIST-05** recommendation history updates only `downstream_utility`.
- [ ] **ACT-REC-HIST-06** two observed K2 failures allow K3 to overtake K2 while K1 remains hard excluded.
- [ ] **ACT-REC-HIST-07** package build and focused temporal suites pass.

These gates remain unchecked until workstation execution.

## Focused workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app\packages\parent-atlas

npm run build

npx vitest run `
  src/core/temporal-recommendation-history-runtime.spec.ts `
  src/core/temporal-recommendation-feature-runtime.spec.ts `
  src/core/temporal-action-alternative-runtime.spec.ts `
  src/core/temporal-action-alternative-feedback.spec.ts `
  src/core/temporal-recommendation-outcome-runtime.spec.ts `
  src/core/temporal-recommendation-outcome-postgres-repository.spec.ts
```

No migrations or external stores are required for these focused tests.

## Deferred

This tranche does not:

- auto-enroll generic agents,
- change the authoritative `AgentActionEventV1` action-history success rates,
- infer `ActionOutcomeV1` from MCP/tool transport success,
- claim causal improvement,
- add Tang sampling,
- alter retrieval relevance/PageRank/PPR/AST features,
- touch Qdrant, Valkey, Neo4j, Arrow, or GPU execution.

The next temporal integration proof is the bounded LangGraph DAG negative-control gate in PR #22 plus the existing non-production durable receipt readback proof.
