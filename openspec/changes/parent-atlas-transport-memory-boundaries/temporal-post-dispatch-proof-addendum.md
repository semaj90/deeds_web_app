# Temporal post-dispatch DRY proof addendum

Status: **PARTIAL_PROVEN** — all 11 numbered gates verified live 2026-08-21 (next session). See "Evidence log" below; two real bugs were found and fixed in the process (a missing package barrel export, and an env-loading ordering bug in the live proof script), not just confirmed passing.

## Purpose

Close the missing post-dispatch half of the temporal action loop without moving identity or artifact ownership.

```text
pre-dispatch DRY gate
  -> actual tool dispatch
  -> explicit ActionOutcomeV1
  -> workflow_artifacts result materialization
  -> WorkflowActionEventV1 (workflow runtime identity)
  -> storage-owned ledger sequence reservation
  -> AgentActionEventV1 append/readback
  -> next identical call
  -> REUSE_RESULT or SELECT_ALTERNATIVE
  -> zero tool redispatch
```

## Ownership

- `WorkflowActionEventV1` remains workflow/action identity owner.
- `ActionExecutionDescriptorV1` / `ActionExecutionKey` remain deterministic execution identity owner.
- `workflow_artifacts` + `ArtifactAddressV1` remain immutable result storage/address owner.
- `atlas_agent_action_events` remains append-only observed history.
- `atlas_agent_action_ledger_sequence_seq` orders append history only and explicitly has `identity_authority=false`.
- The post-dispatch recorder never infers `SUCCESS_EXACT` from transport success or `{ ok: true }`.

## Gates

- [x] **ACT-POST-01** storage-owned monotonic ledger sequence allocator implemented.
- [x] **ACT-POST-02** sequence reservation receipt declares `identity_authority=false` and rejects unsafe/non-numeric values.
- [x] **ACT-POST-03** post-dispatch recorder requires an explicit canonical workflow event and explicit action outcome.
- [x] **ACT-POST-04** successful result materialization uses existing `materializePostgresJsonArtifact()`; no second result store.
- [x] **ACT-POST-05** failed actions append without fabricated `result_ref`.
- [x] **ACT-POST-06** guarded live proof harness added.
- [x] **ACT-POST-07** focused package/SvelteKit tests PASS locally. Verified 2026-08-21 (next session): 3/3 package spec files (16/16 tests) and, after a fix (see below), 4/4 SvelteKit spec files (13/13 tests).
- [x] **ACT-POST-08** `atlas_agent_action_ledger_sequence_seq` migration applied/read back in the shared local-dev Postgres (`legal-ai-postgres`, host port 5434 — this repo has no isolated non-production instance; same correction as the sibling recommendation-outcome addendum). Confirmed the sequence didn't exist before applying (`\ds` empty), applied cleanly (`CREATE SEQUENCE`, `setval` → 1).
- [x] **ACT-POST-09** first successful dispatch count=1; identical second call count remains=1 and returns `REUSE_RESULT`. Verified live via the guarded proof script, twice.
- [x] **ACT-POST-10** first failed dispatch count=1; identical second call count remains=1 and returns `SELECT_ALTERNATIVE`. Verified live via the guarded proof script, twice.
- [x] **ACT-POST-11** durable result artifact and temporal event checksum/readback verified. Verified live: `resultRef: "sha256:..."` returned by the proof, and the corresponding `atlas_agent_action_events`/`workflow_artifacts` rows confirmed present via `docker exec psql` before cleanup.

## Focused validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\packages\parent-atlas
npm run build
npx vitest run `
  src/core/temporal-action-sequence-reservation.spec.ts `
  src/core/temporal-action-postgres-repository.spec.ts `
  src/core/temporal-action-workflow-adapter.spec.ts

cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
npx vitest run `
  src/lib/server/atlas/temporal/temporal-tool-execution-boundary.spec.ts `
  src/lib/server/atlas/temporal/temporal-tool-post-dispatch-recorder.spec.ts `
  src/lib/server/ai/tool-shim.spec.ts `
  src/lib/server/ai/tool-shim-temporal-alternative.spec.ts
```

Guarded live proof:

```powershell
$env:ATLAS_TEMPORAL_DRY_LOOP_PROOF='1'
npx tsx scripts/atlas/prove-temporal-tool-dry-loop.mts
Remove-Item Env:ATLAS_TEMPORAL_DRY_LOOP_PROOF
```

Expected terminal receipt:

```text
TEMPORAL_DRY_LOOP_PROVEN
success firstDispatchCount=1 secondDispatchCount=1 REUSE_RESULT
failure firstDispatchCount=1 secondDispatchCount=1 SELECT_ALTERNATIVE
```

Do not mark the DAG-level proof complete from unit tests alone.

## Evidence log (2026-08-21, next session)

This session did not author the recorder/sequence-reservation/proof-script code above (that landed on `agent/temporal-post-dispatch-proof-20260821`, branched from `main` after PR #17 merged at `f58adb4647`). This session's contribution was independent execution + two real fixes:

```
packages/parent-atlas$ ../../node_modules/.bin/tsc -p tsconfig.json   # rebuild dist first
packages/parent-atlas$ ../../node_modules/.bin/vitest run src/core/temporal-action-sequence-reservation.spec.ts src/core/temporal-action-postgres-repository.spec.ts src/core/temporal-action-workflow-adapter.spec.ts
  -> 3 files passed, 16 tests passed (sequence-reservation itself is 5 tests, not 6)

sveltekit-frontend$ node_modules/.bin/vitest run src/lib/server/atlas/temporal/temporal-tool-execution-boundary.spec.ts src/lib/server/atlas/temporal/temporal-tool-post-dispatch-recorder.spec.ts src/lib/server/ai/tool-shim.spec.ts src/lib/server/ai/tool-shim-temporal-alternative.spec.ts
  -> FIRST RUN: 3/3 tests in temporal-tool-post-dispatch-recorder.spec.ts failed with
     "Cannot read properties of undefined (reading 'parse')" at workflowActionEventSchema.parse().
     Root cause: packages/parent-atlas/src/index.ts never exported
     './core/workflow-action-event.js' — workflowActionEventSchema/WorkflowActionEventV1 were not
     part of the package's public surface at all, even though the new recorder imports them from
     '@deeds/parent-atlas'. Checked for name collisions first (none), added the export, rebuilt.
  -> AFTER FIX: 4/4 files passed, 13/13 tests.

docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_ledger_sequence.sql
  -> confirmed sequence didn't exist first (\ds empty); applied cleanly (CREATE SEQUENCE, setval -> 1)

sveltekit-frontend$ ATLAS_TEMPORAL_DRY_LOOP_PROOF=1 npx tsx scripts/atlas/prove-temporal-tool-dry-loop.mts
  -> FIRST RUN: SASL "client password must be a string" (same class of bug as multiple times
     earlier this session). Root cause here was subtler than the usual "top-level import before
     loadAtlasEnv()": the script already called loadAtlasEnv() textually between two import
     statements, but ES module evaluation runs every STATICALLY imported module (recursively,
     depth-first) before the importing file's own top-level code — so loadAtlasEnv()'s textual
     position didn't matter. temporal-tool-post-dispatch-recorder.js statically imports
     postgres-json-artifact-v1.js, which statically imports `db` from db/client.js — so
     db/client.js's top-level `new Pool()` had already run before loadAtlasEnv() executed,
     regardless of where the loadAtlasEnv() call was written. Fixed by converting all four
     DB-adjacent imports (buildTemporalToolExecutionContext, recordTemporalToolDispatchOutcomeFromPostgres,
     executeTool, {closeConnections, pool}) to dynamic `await import(...)` after loadAtlasEnv().
  -> AFTER FIX, run 1: status TEMPORAL_DRY_LOOP_PROVEN, exact expected receipt shape:
     success {firstDispatchCount:1, secondDispatchCount:1, secondDisposition:"REUSE_RESULT", resultRef:"sha256:..."}
     failure {firstDispatchCount:1, secondDispatchCount:1, secondDisposition:"SELECT_ALTERNATIVE"}
     all 5 invariants as expected (successRedispatched:false, failedActionRedispatched:false,
     successResultMaterializedByWorkflowArtifacts:true, workflowIdentityMintedByTemporalLedger:false,
     actionOutcomeInferredFromTransport:false).
  -> Verified live via docker exec psql: this run left 2 real rows in atlas_agent_action_events
     (one SUCCESS_EXACT/FINALIZED, one TOOL_ERROR/FINALIZED) and 1 real row in workflow_artifacts —
     genuine writes, not simulated. Deleted them (scoped by the proof's own workflowId and
     artifactId) since the script itself has no cleanup step and this is the shared dev instance.
  -> Ran a SECOND time immediately after cleanup to confirm repeatability (fresh UUID workflowId
     each run, so the sequence allocator must handle back-to-back runs cleanly): identical
     TEMPORAL_DRY_LOOP_PROVEN result, cleaned up again. Both tables confirmed empty afterward.
```

Unlike the terminal-tool proof this session wrote for the sibling recommendation-outcome addendum (which had to seed a failure historically because forcing live infra to fail deterministically wasn't practical), this script's failure scenario is genuinely forced live: the `terminal` tool runs a real subprocess that calls `process.exit(7)` on its first (and only) real dispatch, so `SELECT_ALTERNATIVE` on the second call is observing an actually-failed real execution, not a seeded one. This closes the exact gap flagged as DAG-02's caveat in the sibling addendum — for the pre/post-dispatch DRY loop specifically (not the K1→K2 alternative-redirection scenario that DAG-01/04 cover, which remains a separate, complementary proof).

## No promotion in this tranche

No production Qdrant/Valkey/Neo4j mutation, SearchRuntime ranking change, canonical write outside `atlas_agent_action_events`/`workflow_artifacts` (both left as found — this run's rows were deleted, no net change to the shared instance), generic agent enrollment, ACE policy update, model training, GPU scheduling change, merge, or push to `main` is claimed or was performed. The one production-affecting change is the package barrel-export fix (`packages/parent-atlas/src/index.ts`), which is additive and was checked for collisions before applying.
