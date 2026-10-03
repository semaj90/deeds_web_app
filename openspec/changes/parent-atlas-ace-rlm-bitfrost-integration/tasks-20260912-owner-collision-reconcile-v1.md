# Parent Atlas ACE Promotion Board — Owner Collision Reconciliation v1

Date: 2026-09-12
Mode: append-only temporal evidence
Gate: `OWNER-COLLISION-RECONCILE-01`

This file does not replace or rewrite the historical
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` ledger.
The existing ledger remains historical evidence. New promotion-board status is
recorded as a dated addendum.

## Portfolio input

Consume `atlas.openspec-portfolio-implementation-readiness.v1` only as a
read-only portfolio inventory.

Current uploaded portfolio snapshot:

```text
changeCount                   96
taskTotal                     7945
taskComplete                  4948
relationCount                 1326
ownerCollisionCount           111
P1 canonical-table review     66
P2 shared-derived surface     45
mutationRecommendedCount      0
```

Policy inherited from the portfolio:

```text
MCP default       READ_ONLY
canonical owner   POSTGRESQL
derived stores    QDRANT / NEO4J / GPU / CACHE / MODEL_ARTIFACT
automaticMutation false
```

## Promotion-board role

`parent-atlas-ace-rlm-bitfrost-integration` remains the coordination ledger for
promotion decisions because it already references the current source-authority,
Graphify, projection-fabric, HEVAL/WikiSkill, hypergraph, and related receipts.

This gate does **not** make ACE a new canonical runtime owner. It only
adjudicates overlapping OpenSpec claims on the critical promotion spine.

Do not create a second master-promotion OpenSpec while this coordination surface
is sufficient.

## Classification vocabulary

For each relevant competing OpenSpec change classify its relationship to the
selected owner as exactly one of:

```text
CANONICAL_OWNER
DERIVED_PROJECTION
EXECUTOR
CACHE
COMPATIBILITY_LAYER
CHALLENGER
TEST_ONLY
DEAD_ORPHAN
DUPLICATE_OWNER_VIOLATION
UNRESOLVED
```

Only `DUPLICATE_OWNER_VIOLATION` and `UNRESOLVED` on the critical spine block
promotion.

## Critical scope only

Reconcile ownership only for:

1. source/workspace authority;
2. packet/chunk identity;
3. semantic_768 contract and current online semantic projection;
4. SearchRuntime/RRF fusion ownership;
5. current evaluation corpus;
6. Graphify promotion/materializer boundary;
7. ACE/ContextManifest admission boundary;
8. BitFrost/cache residency boundary;
9. KAG/hypergraph evidence boundary;
10. HEVAL evaluation receipts.

All other portfolio collisions remain outside this gate unless they become a
direct prerequisite of one of the resources above.

## Current selected-owner matrix

| Resource | Selected owner | Required interpretation |
| --- | --- | --- |
| source/workspace authority | PostgreSQL canonical source/workspace lineage coordinated through ACE receipts | Graphify and directory/search surfaces are derived/producers, not source truth |
| packet/chunk identity | PostgreSQL `atlas_packets` + `atlas_packet_chunk_lineage` + canonical chunk identity contract | graph/vector/feature layers cannot mint identity |
| semantic_768 contract | `parent-atlas-semantic-768-canonical-contract` | Postgres/existing contract owns representation identity; Qdrant/GPU are projections/executors |
| semantic online projection | current `codebase_chunks_768`; `_v2` remains challenger until admitted | Qdrant projection is rebuildable and non-canonical |
| fusion | `parent-atlas-retrieval-fusion-reachability` / SearchRuntime / `combineViaRRF()` | one logical semantic lane; executor provenance must not create extra votes |
| evaluation corpus | historical `phase-2f1-real-evaluation-corpus`, but CURRENT ownership remains unresolved until rebound to current corpus/workspace/representation/query/judgment checksums | do not run historical 7.x tasks blindly |
| Graphify | `parent-atlas-code-ingestion-pipeline` producer/materializer lifecycle | cannot supersede source authority |
| ACE/ContextManifest | `parent-atlas-ace-rlm-bitfrost-integration` | owns context admission coordination, not source storage |
| BitFrost | ACE/BitFrost integration runtime cache | CACHE only |
| KAG/hypergraph | ACE-linked discovery/evidence receipts | DERIVED_PROJECTION/evidence only |
| HEVAL | ACE-linked HEVAL/WikiSkill receipts | TEST_ONLY/evaluation only |

## Evaluation-corpus correction

The portfolio still reports `phase-2f1-real-evaluation-corpus` with open tasks to
load 50+ queries and run RRF evaluation. Those tasks predate the current stricter
promotion identity.

Classify the historical corpus as:

```text
HISTORICAL_EVAL_CORPUS_OWNER
NEEDS_CURRENT_CORPUS_REBIND
```

Operationally, within `OWNER-COLLISION-RECONCILE-01`, this is represented as an
`UNRESOLVED` current evaluation owner until the corpus is bound to:

```text
current semantic corpus checksum
+ workspace revision
+ representation revision
+ query checksum
+ judgment checksum
```

Do not import or execute historical evaluation rows before that rebind.

## Read-only implementation

Added:

```text
scripts/atlas/reconcile-promotion-critical-owners-v1.mjs
```

The script consumes the portfolio report and emits:

```text
docs/reports/promotion-critical-owner-reconciliation-v1.json
```

Required summary fields:

```text
criticalCanonicalResources
criticalOwnerCollisions
duplicateOwnerViolations
unresolvedOwnerClaims
```

Per-resource fields:

```text
resource
selectedOwnerChange
selectedOwnerArtifact
selectedOwnerRole
competingChanges[]
classification
evidenceRefs[]
blocking
reason
```

Readiness is computed, never manually declared:

```text
safeToProject
safeToImportJudgments
safeToMigrateRrfCallers
safeToRunHEVAL
```

## Expected first-run behavior

The first run is expected to remain blocked because the current evaluation
corpus is intentionally unresolved pending current-corpus rebind.

A blocked result is correct evidence, not a test failure:

```text
OWNER_COLLISION_RECONCILE_BLOCKED
```

Promotion advances only when:

```text
duplicateOwnerViolations = 0
unresolvedOwnerClaims     = 0
```

## Out of scope / frozen

Do not perform any of the following under this gate:

- Postgres mutation;
- Qdrant mutation, collection creation/deletion, alias swap, or snapshot cleanup;
- Neo4j/Valkey/cache mutation;
- Graphify apply/materialization;
- judgment import;
- RRF caller rewrite;
- topology admission;
- reranker serving/configuration;
- GPU/native acceleration work;
- KV-cache adaptation;
- model training or QLoRA;
- storage/Docker cleanup.

## Queue after this gate

```text
P0   PROMOTION-BOARD-RECONCILE-02 receipt inventory
P0A  OWNER-COLLISION-RECONCILE-01 critical spine only
P1   CURRENT-SOURCE / WORKSPACE AUTHORITY exact admitted snapshot
P2   SEMANTIC-CORPUS-ADMISSION-01 one exact semantic_768 cohort
P3   GOLDEN-REVIEW-CORPUS-02 bind judgments to admitted cohort
P4   RRF-CALLER-CLASSIFICATION-02 unmapped=0 executor-as-lane=0
P5   PROMOTION-BOARD-RECONCILE-03 recompute readiness
P6   HEVAL selected-case closure / A0-A1-A2
P7   optional topology/rerank/executors only if evaluation demonstrates need
```

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds-web-app
git fetch origin
git switch agent/promotion-owner-collision-reconcile-20260912
git pull

node --check scripts/atlas/reconcile-promotion-critical-owners-v1.mjs
node scripts/atlas/reconcile-promotion-critical-owners-v1.mjs
```

Then inspect:

```text
docs/reports/promotion-critical-owner-reconciliation-v1.json
```

No promotion is authorized by code presence alone.
