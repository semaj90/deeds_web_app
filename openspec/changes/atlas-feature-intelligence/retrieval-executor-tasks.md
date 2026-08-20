# Retrieval executor / cache / concurrency proof tasks

Status vocabulary follows the Parent Atlas proof ladder: `DONE`, `IMPLEMENTED_UNPROVEN`, `PENDING`, `BLOCKED`.

## Frozen ownership

```text
EVIDENCE FAMILY                 PRODUCTION OWNER / ORACLE

LEXICAL                         Qdrant BM25 + IDF
SEMANTIC exact oracle           cuVS brute force over semantic_768
SEMANTIC ANN                    executor/challenger only
AST                             Tree-sitter + ast-grep exact observations
GRAPH                           canonical graph facts + derived graph algorithms
```

Executor multiplicity must never create evidence-vote multiplicity:

```text
Qdrant HNSW
cuVS CAGRA
cuVS CPU HNSW
FAISS/cuVS
Valkey HNSW
pgvector HNSW

    = alternative SEMANTIC executors
    != independent semantic evidence lanes
```

`semantic_lane_votes = 1` remains invariant.

## BM25 / cache placement

Qdrant remains the production BM25 owner. The sparse BM25/IDF index should be kept in the hot/pinned memory tier when supported by the probed Qdrant version.

Valkey Search is an optional hot CPU-RAM cache for:

```text
latent_64 / latent_128 candidate vectors
revision-qualified candidate metadata
tags / numeric routing features
short-lived retrieval results
```

Do not create another production BM25 vote in Valkey. Valkey text search may be evaluated as a challenger/cache implementation later, but cutover requires an explicit lexical parity receipt.

Valkey vector cache choices:

```text
HNSW    approximate hot cache
FLAT    exact bounded hot cache
```

All Valkey cache keys must include source/representation revision and content or row-identity checksum.

## GPU build -> CPU search

Preferred experiments:

```text
semantic_768
  |
  +-- cuVS CAGRA build on GPU
  |      -> cuVS HNSW hierarchy=CPU
  |      -> CPU search
  |
  +-- FAISS GPU index with use_cuvs=true
         -> FAISS interoperability experiment
```

cuVS CAGRA/HNSW serialization is experimental. Generic hnswlib compatibility must only be claimed for the conversion mode that explicitly produces the CPU hierarchy compatible format. Every persisted ANN generation requires an index-format owner/revision plus exact Recall@K receipt.

Do not add a Node HNSW N-API package solely to duplicate Qdrant/Valkey/cuVS/FAISS. A Node-native HNSW dependency requires a measured gap and its own parity/serialization proof.

## JSON / JSONL parsing

Use parser by data scale and ownership:

```text
small typed control JSON
  -> native JS JSON.parse + Zod

large JSON / JSONL batch ingestion
  -> simdjson native sidecar / existing structured-value path

GPU columnar compute
  -> Arrow/cuDF after normalization
```

simdjson is not an AST parser and must not replace Tree-sitter/ast-grep.

Parallel parsing rule:

```text
one parser/document iteration owner per worker/thread
no sharing one mutable On-Demand parser across concurrent jobs
```

## Node/tRPC concurrency

tRPC is a typed RPC/API boundary, not the CPU scheduler.

```text
I/O-heavy operations
  PostgreSQL
  Qdrant
  Valkey
  SeaweedFS
  HTTP/MCP
      -> Node async I/O + bounded Promise concurrency

CPU-heavy JS operations
  AST post-processing
  large local transforms when kept in Node
      -> reusable worker_threads pool

native/GPU operations
  simdjson
  RAPIDS/cuVS/cuGraph
  Python NLP
      -> bounded native/Python sidecars
```

Never create one worker thread per chunk. Worker pool size and queue depth require runtime/resource receipts.

## PostgreSQL 18 materialization

Migration owner:

```text
sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql
```

Tables:

```text
atlas_observation_records
atlas_observation_feature_rows
```

Indexes are designed for selective relational filtering before vector refinement:

```text
BTREE(source_ref, source_revision, workspace_revision)
BTREE(kmeans_cluster, workspace_revision)
BTREE(som_cell, workspace_revision)
GIN(ontology_classes)
GIN(ast_observation_kinds)
GIN(langextract_classes)
GIN(tags)
GIN(observation_refs)
pgvector HNSW(semantic_768) challenger/fallback
```

The exact pgvector path remains available after filters; the HNSW index is not an extra semantic vote.

Incremental update rule:

```text
UNCHANGED candidate -> no DB/Qdrant/Valkey rewrite
CHANGED candidate   -> upsert same revision-qualified logical identity
DELETED candidate   -> tombstone/delete projections per temporal policy
```

## Qdrant payload projection

The existing hybrid point now carries:

```text
semantic_768
lexical_bm25

payload:
  chunk_id
  source_id
  source_revision
  document_checksum
  chunk_checksum
  domain_class
  ontology_classes[]
  ast_observation_kinds[]
  langextract_classes[]
  tags[]
  kmeans_cluster
  som_cell
  language
  embedding_revision
  producer_revision
```

Only frequently filtered payload fields should receive Qdrant payload indexes after workload measurement.

## Proof ladder

```text
REX-0  single semantic evidence-family vote                DONE
REX-1  Qdrant BM25 lexical owner                           IMPLEMENTED_UNPROVEN
REX-2  observation feature families separated              IMPLEMENTED_UNPROVEN
REX-3  PostgreSQL observation feature schema                IMPLEMENTED_UNPROVEN
REX-4  PostgreSQL feature-row repository                    IMPLEMENTED_UNPROVEN
REX-5  Qdrant observation/tag payload projection            IMPLEMENTED_UNPROVEN
REX-6  executor/cache policy receipts                       IMPLEMENTED_UNPROVEN
REX-7  Valkey Search capability probe                       PENDING
REX-8  Valkey hot latent cache                              PENDING
REX-9  cuVS CAGRA -> CPU HNSW parity                       PENDING
REX-10 FAISS use_cuvs interoperability                      PENDING
REX-11 simdjson bulk-ingress concurrency receipt            PENDING
REX-12 Node worker-pool resource receipt                    PENDING
REX-13 Postgres filtered exact vs HNSW benchmark            PENDING
REX-14 end-to-end router -> exact promotion evaluation      PENDING
```

## Required bounded tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/observation-feature-compiler.test.mjs
node --test packages/parent-atlas/test/retrieval-executor-policy.test.mjs
```

Database schema/runtime proof remains separate:

```bash
npm --prefix sveltekit-frontend run schema:migration:lint
npm --prefix sveltekit-frontend run schema:pre-apply
# apply only through the established reviewed migration path
npm --prefix sveltekit-frontend run schema:post-apply
```

No status may move from `IMPLEMENTED_UNPROVEN` to `PROVEN` from file existence alone.
