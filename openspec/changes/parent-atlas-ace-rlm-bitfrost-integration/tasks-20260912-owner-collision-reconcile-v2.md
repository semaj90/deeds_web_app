# Parent Atlas ACE Promotion Board — Owner/Evidence Reconciliation v2

Date: 2026-09-12
Mode: append-only temporal evidence
Gates: `OWNER-COLLISION-RECONCILE-01`, `PROMOTION-BOARD-RECONCILE-02`

This file does not replace v1 or the historical `tasks.md` ledger. It records the semantic correction discovered after v1: **owner selection and current evidence admission are independent state dimensions**.

## Correction to v1

V1 could accidentally treat an OpenSpec owner change being present as equivalent to current production evidence being proven. That is not sufficient for promotion.

Freeze the distinction:

```text
WHO owns the capability?
        !=
IS the current runtime/corpus evidence admitted?
```

Every critical resource now records:

```text
resource
coordinationChange
canonicalOwnerArtifact
ownershipStatus
  OWNER_RESOLVED | OWNER_COLLISION | OWNER_UNRESOLVED
evidenceStatus
  PROVEN | PARTIAL | BLOCKED | NOT_APPLICABLE
competingChanges[]
competingArtifacts[]
evidenceRefs[]
blocksPromotion
blockers[]
```

`parent-atlas-ace-rlm-bitfrost-integration` remains the coordination ledger only. ACE is not inferred to own canonical source, packet, semantic, graph, or judgment data merely because it coordinates receipts.

## New critical resource: SYMBOL_REPRESENTATION_REGISTRY

Latest audit evidence identifies three uncoordinated symbol/representation surfaces:

```text
graphify_symbols
  current gate-facing surface
  observed empty in the latest audit

atlas_symbol_registry / atlas_symbol_versions
  populated candidate surface
  latest audit reported 10,310 / 285 rows
  but bound to a non-admitted canary/promotion-staging workspace revision

pending atlas_representations migration
  schema candidate
  never applied
```

Current board disposition:

```text
ownershipStatus = OWNER_UNRESOLVED
evidenceStatus  = BLOCKED
```

Do not select a winner by row count. Selection requires agreement across:

- current admitted workspace/source revision;
- stable symbol/version identity;
- representation contract;
- active writer ownership;
- active reader adoption;
- migration authority;
- promotion-gate consumer adoption.

## Semantic split

The board now separates:

```text
SEMANTIC_768_CONTRACT
CURRENT_SEMANTIC_CORPUS
```

The semantic contract can have a selected owner while the current corpus remains blocked.

`CURRENT_SEMANTIC_CORPUS` requires one revision-qualified semantic_768 cohort bound one-to-one to the admitted source/workspace frame. Qdrant collections remain derived projections. `codebase_chunks_768_v2` remains a challenger until lineage, caller and evaluation promotion are proven.

## RRF split

The board now separates:

```text
RRF_SEARCH_RUNTIME_OWNER
RRF_CALLER_CONVERGENCE
```

Owner selection does not prove caller convergence.

`safeToMigrateRrfCallers` requires all three:

```text
RRF_SEARCH_RUNTIME_OWNER = OWNER_RESOLVED
RRF_UNMAPPED             = 0
EXECUTOR_AS_LANE         = 0
```

If current caller counts cannot be extracted from the current ledger, the board fails closed with `RRF_CALLER_COUNTS_NOT_EXTRACTABLE_FROM_CURRENT_LEDGER` rather than inferring convergence.

## Judgment corpus split

The historical `phase-2f1-real-evaluation-corpus` change is retained as a compatibility/history owner, while current judgment evidence remains blocked until it is bound to the current semantic corpus and its revision/checksum identity.

Current promotion dependency remains:

```text
semantic corpus checksum
+ workspace revision
+ representation revision
+ query checksum
+ judgment checksum
```

Historical 7.x evaluation tasks must not be run blindly before that rebind.

## Readiness formulas

```text
safeToBuildSemanticCohort =
    CRITICAL_OWNER_COLLISIONS_ZERO
 && SOURCE_AUTHORITY_PROVEN
 && PACKET_CHUNK_LINEAGE_PROVEN
 && SYMBOL_REPRESENTATION_REGISTRY_OWNER_RESOLVED
 && SYMBOL_REPRESENTATION_CURRENT_REVISION_PROVEN

safeToProject =
    safeToBuildSemanticCohort
 && SEMANTIC_768_OWNER_RESOLVED
 && SEMANTIC_768_OWNER_EVIDENCE_PROVEN
 && CURRENT_SEMANTIC_CORPUS_PROVEN

safeToImportJudgments =
    safeToProject
 && CURRENT_JUDGMENT_CORPUS_PROVEN

safeToMigrateRrfCallers =
    RRF_SEARCH_RUNTIME_OWNER_RESOLVED
 && RRF_UNMAPPED == 0
 && EXECUTOR_AS_LANE_VIOLATIONS == 0

safeToRunHEVAL =
    safeToImportJudgments
 && FROZEN_EVIDENCE_SNAPSHOT_PROVEN
```

These formulas intentionally prevent owner existence from being used as evidence admission.

## New implementation

Added, without replacing v1:

```text
scripts/atlas/reconcile-promotion-critical-owners-v2.mjs
```

Output:

```text
docs/reports/promotion-critical-owner-reconciliation-v2.json
```

Expected present result remains blocked.

Likely blockers include at least:

```text
SYMBOL_REPRESENTATION_REGISTRY_OWNER_UNRESOLVED
SYMBOL_REPRESENTATION_CURRENT_REVISION_NOT_PROVEN
CURRENT_SEMANTIC_CORPUS_NOT_PROVEN
CURRENT_JUDGMENT_CORPUS_NOT_PROVEN
RRF caller convergence evidence incomplete or nonzero
```

## Independent non-P0 findings

The following remain valid but do not become source/semantic P0 ownership blockers merely because they exist:

```text
REVISION_QUALIFIED_ONTOLOGY_TUPLE_SOURCE_MISSING
CURRENT_COMPOSE_FLOATING_EXTERNAL_IMAGES
ARTIFACT_SUPERSESSION_CHAIN_UNPROVEN
ARTIFACT_SUPERSESSION_EVENTS_MISSING
```

They remain their own derived/reproducibility/temporal lanes.

Packet-registry parity can be recorded independently from unresolved writer/migration surface classification; parity alone does not close all writer ownership.

## Frozen work while board is blocked

Do not start or apply:

- semantic corpus writes/backfill;
- Qdrant payload backfill or alias swap;
- `DirectoryProfileV1`;
- Graphify apply/new run solely to satisfy this board;
- symbol or representation migration;
- RRF caller rewrite;
- judgment import;
- topology/rerank/GPU executor expansion;
- Docker/storage cleanup.

Existing pure `ChunkRetrievalProfileV2` and `FileRetrievalProfileV1` code remains valid derived-contract work but is not promoted by this board.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds-web-app
git fetch origin
git switch agent/promotion-owner-collision-reconcile-20260912
git pull

node --check scripts/atlas/reconcile-promotion-critical-owners-v2.mjs
node scripts/atlas/reconcile-promotion-critical-owners-v2.mjs

npx openspec validate `
  parent-atlas-ace-rlm-bitfrost-integration `
  --type change `
  --strict `
  --json

git diff --check
```

No promotion is authorized by code or owner presence alone.
