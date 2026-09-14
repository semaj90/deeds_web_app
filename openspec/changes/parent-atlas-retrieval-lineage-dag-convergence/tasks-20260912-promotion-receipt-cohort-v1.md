# Temporal addendum — PROMOTION-RECEIPT-COHORT-01 — 2026-09-12

This file is append-only temporal evidence. It does not replace or rewrite the historical `tasks.md` ledger.

## Purpose

Close the mixed-revision promotion-receipt ambiguity before any RichChunk or semantic fanout implementation begins.

Existing owner: `parent-atlas-retrieval-lineage-dag-convergence`.

## Implementation added

- `scripts/atlas/reconcile-promotion-receipt-cohort-v1.mjs`
- `scripts/atlas/test-reconcile-promotion-receipt-cohort-v1.mjs`

The reconciler consumes the existing read-only receipts rather than creating a new owner:

- `docs/reports/promotion-gate-receipt-currentness-v1.json`
- `docs/reports/candidate-ordinal-admission-v1.json`
- the ordinal source map named by the admission receipt
- `docs/reports/current-graph-artifact-readiness-v1.json`

It emits/reuses the requested contract shape:

```text
schemaVersion = atlas.promotion-receipt-cohort.v1
workspaceRevision
candidateSnapshotRevision
graphRevision
ordinalMapChecksum
currentReceiptRefs[]
excludedReceipts[]
checksum
```

Receipt classifications are restricted to:

```text
CURRENT_MATCH
HISTORICAL_VALID
STALE_WORKSPACE
STALE_CANDIDATE_SNAPSHOT
MISSING_REVISION_EVIDENCE
INCOMPATIBLE_GRAPH_REVISION
```

Historical receipts are never rewritten or promoted.

## Fail-closed rules

The gate blocks unless all of the following are independently available and compatible:

- exactly one selected workspace revision;
- exactly one candidate snapshot revision;
- exactly one ordinal-map checksum;
- the ordinal map is explicitly bound to the selected workspace revision;
- one compatible graph revision is proven for the selected workspace;
- no selected receipt contradicts candidate/ordinal/graph anchors.

Unbound receipts are excluded as `MISSING_REVISION_EVIDENCE`; their missing fields are never synthesized.

## Current evidence expectation

The existing repository reports predict `PROMOTION_RECEIPT_COHORT_BLOCKED` on the current corpus because:

- `promotion-gate-receipt-currentness-v1.json` selects the Graphify workspace revision while reporting mixed historical revisions;
- `candidate-ordinal-admission-v1.json` proves candidate snapshot/checksum integrity but does not itself establish the selected Graphify workspace binding;
- `current-graph-artifact-readiness-v1.json` reports no current revision-qualified edge artifact / graph ordinal map for the currently selected authority frame.

This expected BLOCKED result is a successful fail-closed outcome, not permission to manufacture replacement revisions.

## Mutation policy

```text
Postgres writes       0
Qdrant writes         0
Neo4j writes          0
Graphify apply        0
receipt rewrites      0
semantic writes       0
```

## Validation state

Focused Node tests are written for:

1. coherent cohort + stale historical exclusion;
2. missing ordinal workspace binding -> BLOCKED;
3. no current graph revision -> BLOCKED.

They have not been executed in this ChatGPT runtime because the local container cannot fetch the branch from GitHub. Workstation execution remains required.

## Gate state

```text
PROMOTION-RECEIPT-COHORT-01    IMPLEMENTED / LIVE RUN PENDING
RICH-CHUNK-CONTRACT-01         BLOCKED UNTIL THIS GATE AND SEMANTIC-768-PHYSICAL-OWNER-01 PASS
```

## Safe workstation commands

```powershell
node --test scripts/atlas/test-reconcile-promotion-receipt-cohort-v1.mjs
node scripts/atlas/reconcile-promotion-receipt-cohort-v1.mjs
npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json
```

Expected output report:

`docs/reports/promotion-receipt-cohort-v1.json`
