# Parent Atlas Observation Routing Fabric (ORF) — proof sequence

Date frozen: 2026-08-19

## Purpose

Compile already-grounded AST / ontology / extraction / graph / lexical evidence into one revision-qualified, interpretable routing fabric before adding more model complexity.

This tranche does **not** replace Tree-sitter identity, PostgreSQL packet/source authority, the semantic_512 exact oracle, graph authority, or ContextManifest exact promotion.

## Frozen boundaries

```text
Tree-sitter / ast-grep / grounded extraction / ontology tuples
                         |
                         v
             ObservationFeatureProjectionV1
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
    Postgres          Qdrant          .okf/MCP
 exact filters     payload hints     stable resources
        |                |                |
        +----------------+----------------+
                         |
                         v
             RetrievalRouterFeatureRowV1
                         |
               tiny router / XGBoost
                         |
                         v
                RetrievalPlanV1
                         |
  lexical + semantic_512 + AST + graph executors
                         |
                         v
                  exact promotion
                         |
                         v
                  ContextManifestV1
                         |
                         v
                    synthesis
```

### Identity

- PostgreSQL owns `packet_key` / `source_ref` identity.
- `tree_node_id` is Tree-sitter/GIS structural evidence and may not be fabricated.
- `source_revision` is NOT required while no canonical live owner exists; source freshness is carried by source-version/mutation receipts.
- Qdrant point IDs, KMeans cluster IDs, SOM cells, PageRank scores and MCP URIs never mint packet identity.

### Representation

- Current persisted code semantic representation: `semantic_512` (EmbeddingGemma MRL prefix + L2 normalization).
- EmbeddingGemma native width `768` is model lineage, not source identity.
- `latent_64` is AE-derived routing geometry only.
- Candidate buckets `32/64/128/256/512` are row counts, not vector dimensions.
- Existing broad `FeatureMatrixRowV1` still contains legacy hard-coded 768 assumptions; ORF is additive and representation-explicit rather than silently rewriting that owner.

### External documentation

- Existing `external_programming_docs_768`, `external_api_examples`, and `external_error_fixes` are legacy projections and remain untouched during this tranche.
- Target shape is one evidence-family collection (programming docs) with fixed indexed payload fields and flattened `key=value` tags.
- A new 512 representation may only become the active external-doc semantic projection after a dry-run migration proves identity coverage and retrieval parity against the existing 768 corpus.
- Never use a zero-vector embedding fallback as valid indexed evidence. Embedding failure must produce a failed/degraded receipt instead.

### MCP

- Current app dependency is `@modelcontextprotocol/sdk@1.22.0`.
- Stable resource URIs are frozen now under `atlas://okf/...`.
- Existing MCP v1 may expose read-only resources using its resource API.
- MCP protocol `2026-07-28` cache hints (`ttlMs`, `cacheScope`) and full JSON Schema 2020-12 behavior require a separately proven v2 SDK migration. Do not claim those wire semantics while running SDK v1.22.0.

## Feature vocabulary

ORF-1 freezes two 32-wide deterministic masks:

- `ontologyMask[32]`
- `astPatternMask[32]`

Open-ended categorical properties use flattened exact tags such as:

```text
ontology=database
ast=database_write
extract=algorithm
vendor=qdrant
family=vector-db
subject=payload-index
```

Tags are metadata/filter hints, not independent retrieval votes.

## Proof gates

- [x] ORF-0 — Existing owners audited: OKF registry, ontology-linked tuples, legacy FeatureMatrix, multicore MCP boundary, external-doc Qdrant scripts.
- [x] ORF-1 — `ObservationFeatureProjectionV1` implemented: fixed ontology/AST masks, grounded structural booleans, LangExtract classes, flattened tags, evidence refs, source/representation lineage.
- [ ] ORF-1P — Run deterministic unit tests for ORF-1 and prove input/output digest stability. Tests are written, not yet executed in this GitHub-only session.
- [ ] ORF-2 — Postgres materializer. Persist projection rows with source/version receipts and selective B-tree/GIN indexes; benchmark filtered exact scans before adding pgvector ANN duplication.
- [ ] ORF-2P — PostgreSQL 18 proof: EXPLAIN/ANALYZE representative filters; capture bitmap/index/heap plan and AIO settings in receipt.
- [x] ORF-3C — `ExternalDocProjectionV1` target contract implemented for one programming-doc evidence family: semantic_512 lineage, selective indexed fields, flattened tags, cluster/community/PageRank payload hints.
- [ ] ORF-3 — Qdrant collection/materializer implementation after migration dry-run proves the target is safe.
- [ ] ORF-3A — External-doc 768→512 migration dry run. Reject zero vectors; preserve document/chunk checksums; compare Recall@K and exact identity before apply.
- [ ] ORF-3P — Qdrant payload-index benchmark: indexed selective fields vs unindexed/nested variants; record memory/storage cost and latency.
- [x] ORF-4 — `ClusterFeatureProjectionV1` implemented: semantic_512/latent_64 lineage, KMeans/SOM/community revisions, probability/distance values, `evidenceAuthority=false`.
- [ ] ORF-4P — Run deterministic cluster-projection tests and prove KMeans/SOM/community revisions cannot become packet identity.
- [x] ORF-5 — `RetrievalRouterFeatureRowV1` implemented as representation-explicit semantic_512 + optional latent_64 + structure/ontology/lexical/graph/cluster/temporal/evidence signals.
- [ ] ORF-5P — Run router-row contract tests; freeze stable numeric flattening order for PyTorch/XGBoost input tensor.
- [x] ORF-6A — Protocol-neutral `.okf` MCP resource catalog implemented with stable `atlas://okf/...` URIs and intended cache policies.
- [x] ORF-6B — MCP v1 registration adapter implemented using read-only resources; no 2026 cache-hint wire claim.
- [ ] ORF-6C — Wire adapter into `mcp-multicore-server.mjs`, run stdio `resources/list` + `resources/read` smoke, verify output/file bounds remain enforced.
- [ ] ORF-6D — MCP 2026-07-28 / TypeScript SDK v2 migration proof: header routing, resource cache hints, list/result caching and JSON Schema 2020-12 tool schemas.
- [ ] ORF-7 — Bounded MCP read tools for search/evidence/graph/hydrate. Existing receipt/time/output limits remain mandatory.
- [ ] ORF-8 — Ornith ContextManifest adapter consumes promoted ORF evidence only; ontology/schema resources are referenced by digest/URI rather than reprefilled wholesale.
- [ ] ORF-9 — Exact-promotion gate combines source freshness + source span + Tree-sitter coordinate + compiler semantic evidence.
- [ ] ORF-10 — Routing evaluation: compare static policy vs XGBoost/tiny PyTorch router on retrieval success, Recall@K, execution success, latency, VRAM/CPU work and regression rate.

## Postgres target (ORF-2)

Start with metadata/features, not another full ANN owner:

```text
atlas_observation_feature_rows
----------------------------------------
packet_key                 PK/join key component
source_ref
source_version_receipt_id
workspace_revision
feature_revision
representation_id
representation_revision
ontology_classes[]
ast_observation_kinds[]
langextract_classes[]
flattened_tags[]
ontology_mask bit/byte payload
ast_pattern_mask bit/byte payload
structural_flags jsonb
kmeans_cluster_id nullable
som_row/som_col nullable
community_id nullable
pagerank nullable
ppr nullable
created_at
```

Selective indexes to prove first:

```text
BTREE (packet_key)
BTREE (source_ref)
BTREE (workspace_revision, feature_revision)
BTREE (kmeans_cluster_id)
BTREE (som_row, som_col)
BTREE (community_id)
GIN   (ontology_classes)
GIN   (ast_observation_kinds)
GIN   (langextract_classes)
GIN   (flattened_tags)
```

Do not add pgvector HNSW here by default. Existing Qdrant/cached GPU semantic executors already own the main ANN workload; Postgres vector use is a bounded exact/join mirror only if a later proof needs it.

## Qdrant target (ORF-3)

Do not split collections by tag or KMeans cell.

Target collection contract:

```text
external_programming_docs_hybrid_512_v1
representation_id = semantic_512
native_model_dimension = 768
projection_method = embeddinggemma-mrl-prefix-renorm
```

Target payload shape:

```json
{
  "chunk_id": "...",
  "source_id": "qdrant",
  "document_checksum": "...",
  "chunk_checksum": "...",
  "source_ref": "...",
  "domain_class": "retrieval",
  "ontology_classes": ["API", "RETRIEVAL", "ALGORITHM"],
  "language": "en",
  "kmeans_cluster_id": 17,
  "som_cell": "08:13",
  "community_id": "41",
  "pagerank": 0.00183,
  "tags": ["vendor=qdrant", "family=vector-db", "subject=payload-index"],
  "representation_id": "semantic_512",
  "representation_revision": "...",
  "producer_revision": "..."
}
```

Index only fields demonstrated to constrain real searches. Cluster/SOM/community values are payload priors, never collection identity.

## Promotion invariant

```text
retrieval hints / router
        |
        v
bounded candidates
        |
        v
exact semantic / lexical / AST / graph evidence
        |
        v
source mutation gate
        |
        v
exact source + structural + compiler promotion
        |
        v
ContextManifestV1
```

A router chooses work. It does not create evidence truth.
