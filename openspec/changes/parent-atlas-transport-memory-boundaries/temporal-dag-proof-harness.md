# Temporal DAG proof harness

Status: **IMPLEMENTED_UNPROVEN**

This note supersedes the older statement in `temporal-recommendation-outcome-addendum.md` that no LangGraph integration harness exists.

The bounded harness exists at:

```text
sveltekit-frontend/src/lib/server/ai/langgraph-dag-temporal-proof.spec.ts
```

The stronger guarded live harness now exists at:

```text
sveltekit-frontend/scripts/atlas/prove-temporal-dag-live-alternative.mts
```

Neither harness changes temporal identity ownership. The live harness is disabled unless `ATLAS_TEMPORAL_DAG_LIVE_PROOF=1` and refuses `NODE_ENV=production`.

## Bounded integration boundary

The Vitest fixture imports and runs the real:

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

## Bounded success fixture

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

The `outcome=null` assertion is intentional in the bounded fixture: MCP `success=true` is a DAG routing signal only and is not promoted to authoritative `ActionOutcomeV1`.

## Bounded failure fixture

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

## Guarded live infrastructure proof

The live script closes the remaining stronger success-path gate without introducing Qdrant writes or a second history/receipt owner.

Prerequisites are read back before any proof action:

```text
workflow_artifacts
atlas_agent_action_events
atlas_agent_action_ledger_sequence_seq
atlas_recommendation_outcome_receipts
```

The live sequence is:

```text
real terminal K1 subprocess
  -> increments proof counter once
  -> exits 7
  -> explicit TOOL_ERROR appended to atlas_agent_action_events

production runAgentDAG()
  -> parses same K1 call
  -> real Postgres ActionCurrent lookup
  -> SELECT_ALTERNATIVE
  -> failed K1 execution key excluded
  -> real Postgres history-based alternative selection
  -> K2 = read-only rg_search
  -> K2 real dispatch through mcp-tool-dispatch
  -> K2 typed MCP success required
  -> explicit SUCCESS_EXACT appended for K2
  -> workflow_artifacts result materialization
  -> LangGraph finalizeSuccess
  -> atlas_recommendation_outcome_receipts append/readback
```

K2 is deliberately bounded and read-only:

```text
tool = rg_search
paths = ['src/lib/server/atlas/temporal']
limit = 5
```

A zero-hit search is still a valid execution proof if the MCP tool returns its canonical `success=true`; retrieval quality is not under test here.

The proof must assert:

```text
K1 counter before DAG == 1
K1 counter after DAG  == 1
K1 durable event_count == 1
K1 latest_outcome == TOOL_ERROR
K2 durable event_count == 1
K2 latest_outcome == SUCCESS_EXACT
selection.failed_execution_key == K1 key
selection.selected_execution_key == K2 key
RecommendationOutcomeReceipt.selected_action_id == K2 candidate
RecommendationOutcomeReceipt.resulting_execution_key == K2 key
RecommendationOutcomeReceipt.downstream_success == true
receipt readback count == 1
```

Expected terminal status:

```text
TEMPORAL_DAG_LIVE_ALTERNATIVE_PROVEN
```

Run only against the intended non-production local database:

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
$env:ATLAS_TEMPORAL_DAG_LIVE_PROOF='1'
npx tsx scripts/atlas/prove-temporal-dag-live-alternative.mts
Remove-Item Env:ATLAS_TEMPORAL_DAG_LIVE_PROOF
```

Without the environment flag the script must return `READY_APPLY_DISABLED` and perform no proof writes.

## Gate interpretation

Current connector-authored state remains **IMPLEMENTED_UNPROVEN**. Do not promote from source inspection alone.

A successful bounded Vitest run provides integration-contract evidence for:

- `ACT-REC-OUT-DAG-01` known failure -> different edge -> downstream success receipt;
- `ACT-REC-OUT-DAG-02` selected edge -> terminal downstream failure receipt;
- `ACT-REC-OUT-DAG-03` `persist_outcome_receipt=false` -> selected edge still executes but receipt persistence is not attempted;
- `ACT-REC-OUT-DAG-04` selected execution key continuity from recommendation through selection, DRY gate, dispatch, and receipt.

The guarded live script is the stronger evidence for the success-path portions of `ACT-REC-OUT-DAG-01` and `ACT-REC-OUT-DAG-04` because it uses real Postgres history, the production LangGraph/tool-shim boundary, real read-only RG search, temporal result materialization, and real recommendation-outcome persistence/readback.

`ACT-REC-OUT-DAG-02` and the no-persistence negative control remain bounded-fixture proofs unless separate guarded live variants are intentionally required.
