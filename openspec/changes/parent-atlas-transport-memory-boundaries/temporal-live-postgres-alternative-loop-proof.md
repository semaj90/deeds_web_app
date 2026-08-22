# Temporal live Postgres alternative-outcome loop proof

Status: `WRITTEN_UNPROVEN`

This proof closes the remaining runtime gap between the already-merged temporal
contracts and a real receipt-backed procedural-memory loop. It does **not** add a
new temporal owner, recommendation owner, action identity, or artifact registry.

## Existing owners

- `WorkflowActionEventV1` owns workflow/action identity.
- `ActionExecutionDescriptorV1` + `buildActionExecutionKey()` own deterministic execution identity.
- `AgentActionEventV1` is immutable temporal execution history.
- `atlas_agent_action_events` is append-only Postgres persistence for that history.
- `ActionCurrentProjectionV1` is derived/rebuildable.
- `NextActionRecommendationV1` records what the recommendation policy predicted.
- `RecommendationOutcomeReceiptV1` records what happened after the selected action.
- `atlas_recommendation_outcome_receipts` is append-only persistence for the immutable outcome receipt.

## Proof runner

`packages/parent-atlas/scripts/prove-temporal-alternative-outcome-loop-live.mjs`

The runner requires the existing migrations to have already been applied. It
must never apply schema changes itself.

Required objects:

- `atlas_agent_action_events`
- `atlas_agent_action_ledger_sequence_seq`
- `atlas_recommendation_outcome_receipts`

The proof uses one SQL transaction and rolls back all table rows before exit.
Sequence reservations are intentionally outside transactional rollback semantics;
sequence gaps remain valid append-log behavior and are not workflow/action identity.

## Required causal chain

```text
K1 FINALIZED TOOL_ERROR
        |
        v
ActionCurrent(K1)
        |
        v
decideExecutionReuse
        |
        v
HIT / FAILURE / SELECT_ALTERNATIVE
        |
        v
K1 hard excluded
        |
        v
recommendAlternativeActionFromHistory
        |
        v
K2 selected
        |
        v
ActionCurrent(K2)
        |
        v
independent DRY decision = EXECUTE
        |
        v
K2 dispatch exactly once
        |
        v
K2 FINALIZED SUCCESS_EXACT
        |
        v
RecommendationOutcomeReceiptV1
        |
        v
Postgres append + checksum readback
```

## Acceptance gates

### LIVE-ALT-01 — schema preflight

All three required Postgres objects exist. Missing objects fail closed. The
proof runner never falls back to an in-memory repository and never creates the
schema automatically.

### LIVE-ALT-02 — K1 durable known failure

A throwaway K1 `AgentActionEventV1` is appended through the real Postgres
repository using a sequence reserved from
`atlas_agent_action_ledger_sequence_seq`. Append readback must verify the event
checksum.

### LIVE-ALT-03 — DRY known-failure decision

`currentByExecutionKey(K1)` followed by `decideExecutionReuse()` must return:

```text
decision    = HIT
hit_kind    = FAILURE
disposition = SELECT_ALTERNATIVE
```

The K1 tool is not dispatched during this proof.

### LIVE-ALT-04 — exact hard exclusion

The exact K1 execution key must appear in
`AlternativeActionSelectionV1.excluded_execution_keys`. Numeric feature weights
must not be able to re-select the exact failed execution.

### LIVE-ALT-05 — K2 independent execution identity

K2 must have a different `ActionExecutionKey`. Before execution it must undergo
its own `currentByExecutionKey()` + `decideExecutionReuse()` call and receive an
`EXECUTE / EXECUTE_PROPOSED` decision. Selection is not execution authorization.

### LIVE-ALT-06 — one real bounded K2 dispatch

The proof performs one real, read-only `rg` subprocess against the temporal
ledger source. The dispatch counter must prove:

```text
K1 dispatch count = 0
K2 dispatch count = 1
```

This is deliberately bounded and does not mutate the workspace, Qdrant, Valkey,
or application workflow state.

### LIVE-ALT-07 — K2 terminal action history

K2 is appended as `FINALIZED / SUCCESS_EXACT` with a non-null result reference.
The append receipt checksum must equal checksum-verified readback.

### LIVE-ALT-08 — recommendation outcome durability

A `RecommendationOutcomeReceiptV1` must reference the recommendation that
selected K2 and must carry K2's exact execution key. It is appended through the
real recommendation-outcome Postgres repository and checksum-verified on
readback.

### LIVE-ALT-09 — no K1 redispatch

After the complete loop, K1 must still have exactly one event in the scoped
proof history and the proof-local K1 invocation count must remain zero.

### LIVE-ALT-10 — cleanup semantics

The SQL transaction must `ROLLBACK` before exit. Table rows created by the proof
must not remain in the shared database. Sequence gaps are expected and accepted.

## Command

```bash
cd C:\Users\james\Videos\deeds_web_app\packages\parent-atlas
npm run build
node scripts/prove-temporal-alternative-outcome-loop-live.mjs
```

Expected terminal receipt:

```text
proof.status = LIVE_ALTERNATIVE_OUTCOME_LOOP_PROVEN
proof.k1_not_redispatched = true
proof.k2_dispatched_exactly_once = true
proof.action_event_checksums_verified = true
proof.recommendation_outcome_checksum_verified = true
proof.relevant_revision_authority_proven = true
proof.live_postgres_readback = true
transaction_rolled_back = true
```

Do not mark this proof `PROVEN` from source inspection or unit tests. It becomes
`LIVE_ALTERNATIVE_OUTCOME_LOOP_PROVEN` only after the command above succeeds
against the intended non-production/local Postgres instance.
