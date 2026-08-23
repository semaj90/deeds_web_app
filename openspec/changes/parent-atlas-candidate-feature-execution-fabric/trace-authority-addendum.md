# Parent Atlas Trace Authority Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum introduces the first normalized durable-trace contracts needed to connect retrieval evidence to downstream outcomes without promoting the existing mixed `WorkflowTrace` diagnostic envelope or the legacy synthetic `agent_traces` corpus into canonical training authority.

## Current diagnosis

```text
TRACE_EVIDENCE_PRODUCERS_EXIST
NO_SINGLE_DURABLE_TRACE_AUTHORITY_YET
LEGACY_TRAINING_TRACE_IDENTITY_IS_SYNTHETIC
NEW_TRAINING_PIPELINE_MUST_CAPTURE_CANONICAL_IDENTITY_AT_TRACE_TIME
```

Existing systems remain separate:

```text
packages/atlas-core WorkflowTrace
  richer diagnostic execution envelope
  best-effort persistence semantics
  workflow_traces table authority not proven

shipping retrieval telemetry
  real retrieval reachability
  Postgres schema exists
  revision-light and outcome-disconnected

agent_traces
  historical experiment corpus
  current training rows are synthetic / legacy identity
```

## TRACE-OWN-01 — TraceExecutionV1

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/traces/trace-authority-v1.ts
```

`TraceExecutionV1` is the correlation identity for one execution. It binds:

```text
traceId
requestId
workflowId?
queryHash
surface
workspaceRevision
graphRevision?
representationRevision
revisionSetHash
startedAt
finalizedAt?
state
checksum
```

It explicitly records `identityAuthority=false`; a trace id is not packet/symbol/candidate identity.

## TRACE-OWN-02 — TraceCandidateEvidenceBindingV1

Each candidate receives its own revision-qualified evidence row:

```text
traceId
candidateOrdinal?
candidateSnapshotRevision?
packetKey
canonicalId
symbolVersionId?
sourceRef
workspaceRevision
sourceRevision
representationRevision
logicalLane
executor
rawScore?
normalizedScore?
rank
retrieved
selected
exactPromoted
usedInContext
executionDependentOnCandidate
evidenceRefs[]
bindingChecksum
```

The contract fails closed on impossible progression:

```text
selected                 requires retrieved
exactPromoted            requires selected
usedInContext            requires exactPromoted
executionDependent...    requires usedInContext
```

`CandidateOrdinal` is accepted only together with `candidateSnapshotRevision`. It remains a snapshot-scoped execution coordinate, never canonical identity.

## TRACE-OWN-03 — TraceOutcomeReceiptV1

Outcome is separate from candidate evidence and therefore cannot silently become a relevance label.

```text
receiptId
traceId
executed
finalized=true
outcome = SUCCESS | PARTIAL | FAILURE | ABORTED
downstreamSuccess?
repairSucceeded?
verificationPassed?
resultRef?
failureClass?
errorCode?
latencyMs?
tokenCost?
verificationReceiptRefs[]
workspaceRevision
graphRevision?
representationRevision
revisionSetHash
finalizedAt
checksum
```

A repair cannot be marked successful unless verification passed. An unexecuted action cannot emit a successful outcome.

## Explicit non-goals

This tranche does **not**:

- create or apply a Postgres migration;
- write to the protected shared `5434` proxy;
- make `workflow_traces` canonical;
- wire SearchRuntime retrieval telemetry yet;
- wire GAN workflow outcomes yet;
- alter `agent_traces`;
- create XGBoost relevance labels;
- infer packet identity from legacy `feature_id` labels;
- authorize FANOUT;
- alter CandidateFeatureSnapshot or GPU ownership.

## Proof gates

- [ ] TRACE-OWN-01 deterministic `TraceExecutionV1` checksum.
- [ ] TRACE-OWN-02 finalized/open state invariants fail closed.
- [ ] TRACE-OWN-03 candidate evidence identity + source revision round-trip.
- [ ] TRACE-OWN-04 impossible retrieved→selected→promoted→used progression fails closed.
- [ ] TRACE-OWN-05 CandidateOrdinal cannot exist without candidate snapshot revision.
- [ ] TRACE-OWN-06 outcome remains separate from candidate relevance.
- [ ] TRACE-OWN-07 repair success requires validator success.

Focused validation:

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run src/lib/server/atlas/traces/trace-authority-v1.spec.ts
```

Required status before promotion:

```text
TRACE_AUTHORITY_CONTRACT_PROVEN
```

The next safe tranche after the focused contract proof is **TRACE-OWN-04/05**: append/read/checksum repository semantics plus an unapplied additive migration that can only be exercised against a disposable database. The protected shared `5434` target must remain hard-rejected.
