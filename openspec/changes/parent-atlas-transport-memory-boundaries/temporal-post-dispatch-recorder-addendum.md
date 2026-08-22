# Temporal post-dispatch recorder addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum closes the missing post-dispatch seam without changing canonical ownership.

## Ownership

```text
tool shim
  -> actual concrete dispatch
  -> workflow-owned post-dispatch callback
  -> successful result: workflow_artifacts / ArtifactAddressV1
  -> workflow runtime emits WorkflowActionEventV1
  -> atlas_agent_action_ledger_sequence_seq reserves append ordering
  -> adaptWorkflowActionEventToTemporalHistory()
  -> atlas_agent_action_events append + checksum readback
  -> ActionCurrentProjectionV1 is rebuilt from immutable history
```

The following ownership constraints are mandatory:

1. `WorkflowActionEventV1` remains the workflow/action identity owner.
2. The temporal recorder MUST NOT mint `workflowId`, `workflowRevision`, `actionId`, workflow `sequence`, `receiptId`, or `dagNodeId`.
3. `workflow_artifacts` + `ArtifactAddressV1` remain the result-storage owner for reusable successful tool outputs.
4. The temporal ledger stores result references only; it MUST NOT store arbitrary tool-result bytes.
5. `atlas_agent_action_ledger_sequence_seq` owns append-log ordering only. It is not workflow, action, execution, artifact, or revision identity. Gaps are legal.
6. `ActionOutcomeV1` is explicit. MCP `success`, `ok`, non-null payloads, workflow completion, retrieval rank, and recommendation rank MUST NOT manufacture `SUCCESS_EXACT`.
7. A temporal post-dispatch hook runs only after a concrete tool dispatch. `REUSE_RESULT`, `SELECT_ALTERNATIVE`, unsupported tools, and missing terminal commands MUST NOT create a fresh action event.

## Implemented seam

### `temporal-post-dispatch-recorder.ts`

The dependency-injected core requires:

```text
materialize_result
emit_workflow_terminal_event
reserve_ledger_sequence
append_temporal_event
```

The workflow emitter is deliberately injected because it is the identity authority.

Successful recording order is:

```text
explicit successful ActionOutcomeV1
  -> materialize immutable result artifact
  -> validate ArtifactAddressV1
  -> workflow owner emits kind=completed with artifact ref
  -> reserve storage ledger sequence
  -> temporal adaptation using artifactId as result_ref
  -> append
  -> exact event_id/event_checksum receipt verification
```

Failed recording order is:

```text
explicit non-success ActionOutcomeV1 + error_code
  -> no result artifact materialization
  -> workflow owner emits kind=failed with matching errorCode
  -> reserve storage ledger sequence
  -> temporal adaptation with result_ref=null
  -> append + readback verification
```

`recordTemporalPostDispatchFromPostgres()` binds the existing `workflow_artifacts` JSON materializer and temporal Postgres repository only when called. The pure recorder has no database initialization side effect on import.

### `tool-shim.ts`

`context.temporalPostDispatch` is an opt-in workflow-owned callback. It receives the concrete dispatched call, result, selected temporal action context, and pre-tool boundary decision.

It is not invoked for temporal short circuits. The shim does not classify the result into an `ActionOutcomeV1`.

## Proof gates

All gates remain unproven until executed.

```text
ACT-POST-01  successful explicit outcome requires payload/schema/revisions
ACT-POST-02  success materializes ArtifactAddressV1 before terminal workflow event
ACT-POST-03  workflow emitter owns and supplies canonical workflow/action identity
ACT-POST-04  completed event must carry the exact materialized artifactId
ACT-POST-05  failed outcome carries explicit error_code and result_ref=null
ACT-POST-06  storage sequence receipt declares identity_authority=false
ACT-POST-07  temporal append receipt exactly matches event_id + event_checksum
ACT-POST-08  tool shim invokes post-dispatch hook only after a real dispatch
ACT-POST-09  REUSE_RESULT and SELECT_ALTERNATIVE do not invoke post-dispatch hook
ACT-POST-10  first RG_SEARCH dispatch count=1; identical proven repeat still count=1
ACT-POST-11  first successful result materialization count=1; reused repeat still count=1
ACT-POST-12  explicit known failure projects to HIT/SELECT_ALTERNATIVE without redispatch
```

## Promotion blockers

The implementation MUST remain **IMPLEMENTED_UNPROVEN** until all of the following are observed in a non-production proof environment:

1. `20260821_atlas_agent_action_events.sql` is applied and the sequence allocator is verified under the target Postgres version.
2. append/readback checksum and duplicate idempotency tests pass against Postgres.
3. `workflow_artifacts` materialization + readback verifies the real result checksum and revision set.
4. the package temporal tests, Svelte temporal tests, recorder tests, and shim closed-loop tests pass.
5. one end-to-end execution proves `execute once -> same ActionExecutionKey -> REUSE_RESULT -> zero redispatch`.
6. one end-to-end failure proves `known failure -> SELECT_ALTERNATIVE -> zero redispatch of failed execution key`.

No production temporal auto-enrollment or canonical write promotion is authorized by this addendum.
