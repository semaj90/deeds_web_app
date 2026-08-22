# Temporal DAG proof harness

Status: **WRITTEN_UNPROVEN**

This note supersedes the older statement in `temporal-recommendation-outcome-addendum.md` that no LangGraph integration harness exists.

The harness now exists at:

```text
sveltekit-frontend/src/lib/server/ai/langgraph-dag-temporal-proof.spec.ts
```

It is deliberately a bounded integration fixture, not a live Qdrant/Postgres/Valkey proof.

## Boundary exercised

The fixture imports and runs the real:

```text
runAgentDAG()
executeTool()
decideExecutionReuse()
projectActionCurrent()
selectTemporalAlternativeTool()
buildFinalRecommendationOutcomeReceipt()
```

External side-effect owners are replaced with bounded adapters:

```text
Valkey               mocked
ACE/Engram telemetry mocked
MCP transport        mocked
Postgres history     in-memory immutable AgentActionEventV1 array
receipt persistence  in-memory capture of the real receipt builder
```

No Qdrant/Postgres/Valkey/Neo4j canonical mutation is performed by the fixture.

## Success fixture

The first fixture seeds one checksum-valid finalized action history event:

```text
K1 QDRANT_SEARCH
outcome = TOOL_ERROR
retry disabled
PROVEN workspace/source revisions
```

Then it runs the production LangGraph entry point with K1 as the requested temporal action and one concrete RG_SEARCH K2 candidate.

Expected control flow:

```text
K1 DRY gate
  -> HIT / SELECT_ALTERNATIVE
  -> K1 hard excluded
  -> deterministic K2 recommendation
  -> K2 DRY gate
  -> DISPATCH_EXECUTE
  -> RG_SEARCH executes exactly once
  -> typed MCP success routes finalizeSuccess
  -> RecommendationOutcomeReceiptV1 captured
```

Assertions require:

```text
boundary calls == [K1, K2]
actual dispatches == [K2]
K1 dispatch count == 0
selected_execution_key == K2 execution key
receipt.resulting_execution_key == K2 execution key
receipt.followed_recommendation == true
receipt.downstream_success == true
receipt.outcome == null
```

The `outcome=null` assertion is intentional: MCP `success=true` is a DAG routing signal only and is not promoted to authoritative `ActionOutcomeV1`.

## Failure fixture

The second fixture uses the same known-failed K1 but makes the selected K2 return typed MCP failure.

Assertions require:

```text
K1 dispatch count == 0
K2 dispatch count == 1
terminal DAG success == false
one RecommendationOutcomeReceiptV1 captured
receipt.resulting_execution_key == K2 execution key
receipt.downstream_success == false
receipt.outcome == null
```

The retry/failure-lookup pass must not execute K1 again.

## No-persistence negative control

The third fixture uses the same known-failed K1 and successful deterministic K2 path, but explicitly sets:

```text
persist_outcome_receipt = false
```

This must change only the persistence side effect, not alternative execution.

Assertions require:

```text
K1 dispatch count == 0
K2 dispatch count == 1
terminal DAG success == true
receipt persistence attempts == 0
```

The mocked `persistTemporalRecommendationOutcomeFromPostgres()` is the only path that appends to the fixture receipt capture. Therefore `proof.receipts.length == 0` is the negative-control assertion that persistence was never attempted.

## Gate interpretation

Until the Vitest file is executed successfully, all of this remains **WRITTEN_UNPROVEN**.

After a successful local run, this fixture can provide integration-contract evidence for:

- `ACT-REC-OUT-DAG-01` known failure -> different edge -> downstream success receipt;
- `ACT-REC-OUT-DAG-02` selected edge -> terminal downstream failure receipt;
- `ACT-REC-OUT-DAG-03` `persist_outcome_receipt=false` -> selected edge still executes but receipt persistence is not attempted;
- `ACT-REC-OUT-DAG-04` selected execution key continuity from recommendation through selection, DRY gate, dispatch, and receipt.

It does not by itself prove the stronger live-infrastructure gate:

```text
real Qdrant-backed K1 history
-> real Postgres ActionCurrent lookup
-> real RG_SEARCH/MCP K2
-> real atlas_recommendation_outcome_receipts append/readback
```

That remains a separate live proof after this bounded DAG fixture passes.
