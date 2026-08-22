# Temporal DAG persistence negative control

Status: **WRITTEN_UNPROVEN**

This addendum closes the code gap called out as `ACT-REC-OUT-DAG-03` in `temporal-dag-proof-harness.md`.

The new bounded fixture is:

```text
sveltekit-frontend/src/lib/server/ai/langgraph-dag-temporal-persistence-disabled.spec.ts
```

It runs the real `runAgentDAG()` and preserves the same procedural shape as the primary DAG proof:

```text
known finalized K1 failure
  -> DRY HIT / SELECT_ALTERNATIVE
  -> K1 is not redispatched
  -> deterministic K2 selected
  -> K2 receives its own DRY evaluation
  -> K2 dispatches exactly once
  -> typed success reaches finalizeSuccess
```

The only policy difference is:

```text
persist_outcome_receipt = false
```

The persistence boundary is replaced by a fail-fast mock that increments a counter and throws if called. The test therefore requires:

```text
K1 dispatch count == 0
K2 dispatch count == 1
DAG terminal success == true
persistence call count == 0
ctx.temporalRecommendationOutcome == undefined
ctx.temporalRecommendationOutcomePersisted != true
```

This proves the opt-out path is a real negative control rather than merely ignoring the returned receipt after persistence.

Until the fixture executes locally, `ACT-REC-OUT-DAG-03` remains **WRITTEN_UNPROVEN**.

The stronger live-infrastructure proof remains separate and still requires real Postgres temporal history/current lookup, real K2 execution, and real recommendation-outcome append/readback. This fixture performs no Qdrant/Postgres/Valkey/Neo4j mutation.
