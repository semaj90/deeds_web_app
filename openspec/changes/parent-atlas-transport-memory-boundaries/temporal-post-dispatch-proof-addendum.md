# Temporal post-dispatch DRY proof addendum

Status: **IMPLEMENTED_UNPROVEN** until the focused package/SvelteKit tests and guarded live proof are executed on the intended workstation database.

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
- [ ] **ACT-POST-07** focused package/SvelteKit tests PASS locally.
- [ ] **ACT-POST-08** `atlas_agent_action_ledger_sequence_seq` migration applied/read back in intended non-production DB.
- [ ] **ACT-POST-09** first successful dispatch count=1; identical second call count remains=1 and returns `REUSE_RESULT`.
- [ ] **ACT-POST-10** first failed dispatch count=1; identical second call count remains=1 and returns `SELECT_ALTERNATIVE`.
- [ ] **ACT-POST-11** durable result artifact and temporal event checksum/readback verified.

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
