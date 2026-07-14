# Relevant Files Inventory: Domain Classifier + Cross-Reranker → XGBoost

**Date**: July 13, 2026  
**Comprehensive File Map for End-to-End Pipeline**

---

## TIER 1: CRITICAL GAP FILES

### 1. Neo4j GDS PageRank (NOT WIRED)

**Schema & Contract**:
- `src/lib/server/db/neo4j-gds-retrieval.ts` — GDS retrieval contracts
- `src/lib/server/db/neo4j-gds.ts` — Neo4j GDS client (may have unused PageRank call)
- `src/lib/server/graph/neo4j-gds-orchestrator.ts` — GDS orchestration (check if PageRank wired)
- `src/lib/server/db/schema/topology.ts` — Neo4j schema for topology nodes

**GPU Fallback** (if no Neo4j):
- `src/lib/gpu/webgpu-pagerank.ts` — GPU-accelerated PageRank (WebGPU)
- `src/lib/gpu/tensorrt-worker-pool.ts` — TensorRT worker for GPU ops

**Intent Recognition**:
- `src/lib/intent/regex-intent.ts` — Keywords include 'pagerank' (line ~50)

**Missing Files to Create**:
- ❌ `src/lib/server/neo4j/gds-pagerank-batch.ts` — Batch PageRank compute
- ❌ `scripts/atlas/gds-pagerank-compute.mjs` — CLI script for PageRank refresh

---

### 2. Latent128 Autoencoder (SCHEMA ONLY)

**Schema**:
- `src/lib/server/config/vector-config.ts` — Vector slot definitions (recognizes 128-dim)
- `src/lib/server/db/schema-postgres.ts` — Postgres schema (may have latent_128 column definition)
- `src/lib/server/db/warden-schema.ts` — Warden validation schema

**Qdrant Collection**:
- `src/lib/server/vector/qdrant-multivector-schema.ts` — Defines `codebase_topology_128` collection

**Compression**:
- `src/lib/gpu/autoencoder-compression.ts` — Quantize/dequantize helpers (no training code)

**Missing Files to Create**:
- ❌ `scripts/atlas/train-autoencoder-128.mjs` — AE training script (768→128)
- ❌ `src/lib/server/vector/autoencoder-training-pipeline.ts` — AE training orchestrator

---

### 3. Latent64 Qdrant RRF (PARTIAL)

**Msgpack Codec** (FP16 Ready):
- `src/lib/server/serialization/packet-msgpack-codec.ts` — FP16/FP32 encoding (lines 67-120)
- `src/lib/schemas/packet-canonical.ts` — Canonical packet shape with latent_64

**Qdrant Multi-Vector**:
- `src/lib/server/vector/qdrant-multivector-schema.ts` — latent64 named vector defined
- `src/lib/server/config/vector-config.ts` — Vector slot routing (`vectorSlotFor()`)

**Current RRF** (4 lanes, needs 5):
- `src/lib/server/retrieval/rrf-fusion.ts` — RRF combiner (check weight config)
- `src/lib/server/retrieval/rrf-multi-vector.ts` — Multi-vector RRF (may need latent_64 lane)
- `src/lib/server/retrieval/multi-vector-rrf.ts` — Alternative RRF implementation
- `src/lib/server/retrieval/rrf-combiner.ts` — RRF combine logic
- `src/lib/server/retrieval/compute-rrf-score.ts` — RRF score computation

**Storage**:
- `src/lib/server/db/schema-postgres.ts` — `atlas_packets.latent_64` column (bytea)

**Missing Files to Create**:
- ❌ `src/lib/server/retrieval/rrf-multi-vector-with-latent.ts` — 5-lane RRF (add latent_64)

---

### 4. Neo4j Fan-Out (NOT WIRED)

**Promotion Pipeline** (Postgres-only):
- `src/lib/server/retrieval/promote-results-outbox.ts` — Promotion outbox (Postgres write only)
- `src/lib/server/retrieval/promote-results.ts` — Promotion orchestrator

**Neo4j Sync** (May have fan-out logic):
- `src/lib/server/dispatcher/neo4j-mirror-sync.ts` — Neo4j mirror sync (check if wired to promotion)
- `src/lib/server/graph/pg-neo4j-sync.ts` — Postgres → Neo4j sync (generic, not promotion-specific)
- `src/lib/server/graph/codebase-neo4j-sync.ts` — Codebase → Neo4j sync

**SearchRuntime** (Where promotion is called):
- `src/lib/server/retrieval/search-runtime.ts` — 10-step pipeline (step 10: promote)

**Missing Files to Create**:
- ❌ `src/lib/server/retrieval/promote-results-neo4j.ts` — Neo4j fan-out after Postgres

---

## TIER 2: READY TO WIRE

### 5. Domain Classifier (EXISTS, NEEDS WIRING)

**Implementation**:
- `src/lib/server/classifier/domain-classifier.ts` — Core classifier logic
  - Keywords: legal, graph, ml, agent, general
  - Function: `classifyDomainFromText(text: string)`

**Where to Wire**:
- `src/lib/server/retrieval/search-runtime.ts` — Step 6 (after rerank, before promotion)
  - Add: `const domain = classifyDomainFromText(packet.summary || packet.title || '');`

**Schema Field**:
- `src/lib/server/db/schema-postgres.ts` — `atlas_packets.domain` column

---

### 6. Cross-Encoder Reranker (WIRED)

**Implementations** (multiple, check which is canonical):
- `src/lib/server/retrieval/cross-encoder-reranker.ts` — Mixedbread + Redis caching (CANONICAL)
- `src/lib/server/ai/trace-reranker.ts` — Trace-based reranker
- `src/lib/server/retrieval/attention-reranker.ts` — Attention-based reranker
- `src/lib/server/retrieval/boosted-reranker.ts` — Boosted reranker
- `src/lib/server/retrieval/cluster-aware-reranker.ts` — Cluster-aware reranker
- `src/lib/server/ai/graph-reranker.ts` — Graph-based reranker
- `src/lib/gpu/gpu-search-reranker.ts` — GPU-accelerated reranker

**Status**: ✅ Already integrated into SearchRuntime step 4

**Redis Caching**:
- Backend: Triton (primary), fallback Ollama
- L0: result-set cache (1h TTL)
- L1: per-score cache (24h TTL)

---

### 7. Title Generator (SCHEMA EXISTS, GENERATION MISSING)

**Existing Labels/Registry**:
- `src/lib/server/labels/feature-label-registry.ts` — Feature label registry
- `src/lib/server/labels/feature-label-registry.shared.json` — Shared registry (data file)
- `src/lib/server/generation/feature-label-extractor.ts` — Label extraction (may be partial)
- `src/lib/server/indexer/feature-label-enricher.ts` — Label enrichment

**Routes** (may have endpoint):
- `src/routes/api/atlas/feature-labels/+server.ts` — Feature labels API

**Schema Field**:
- `src/lib/server/db/schema-postgres.ts` — `atlas_packets.title_id` or `feature_label` column

**Missing Files to Create**:
- ❌ `src/lib/server/retrieval/title-generator.ts` — LLM-based generation (Gemma4)

---

### 8. SOM Topology (PARTIAL)

**SOM Training** (Complete):
- `src/lib/gpu/index.ts` — GPU modules (includes SOM trainer)
- `src/lib/server/graph/som-topology-pipeline.ts` — SOM pipeline orchestration
- `src/lib/gpu/autoencoder-compression.ts` — SOM uses this for clustering

**Qdrant Payload** (Complete):
- `src/lib/server/vector/qdrant-multivector-schema.ts` — som_cluster in payload

**Neo4j Edges** (MISSING):
- ❌ Need: Create `BELONGS_TO_CLUSTER` edges from file nodes to SOM cluster nodes

**Files to Modify**:
- `src/lib/server/topology/canonical-id-hierarchy.ts` — May need SOM node hierarchy
- `src/lib/server/db/schema/topology.ts` — Neo4j schema for SOM cluster nodes

**Missing Files to Create**:
- ❌ `src/lib/server/topology/som-to-neo4j-fan-out.ts` — SOM cluster edge creation

---

## TIER 3: SUPPORT INFRASTRUCTURE

### SearchRuntime Core (10-Step Pipeline)

**Main Implementation**:
- `src/lib/server/retrieval/search-runtime.ts` — Orchestrator (CANONICAL)
  - Step 1: retrieve (4 lanes: BM25, Qdrant, AST, exact)
  - Step 2: hydrate
  - Step 3: fuse (RRF)
  - Step 4: rerank (Cross-Encoder)
  - Step 5: mark promotion
  - Step 6: domain classify (TODO)
  - Step 7: title generate (TODO)
  - Step 8: topology enrich (TODO)
  - Step 9: validate
  - Step 10: promote to Postgres

**Tests**:
- `src/lib/server/retrieval/search-runtime.spec.ts` — Unit tests

---

### RRF Fusion (4 lanes, needs 5)

**Core RRF**:
- `src/lib/server/retrieval/compute-rrf-score.ts` — RRF score formula
- `src/lib/server/retrieval/rrf-combiner.ts` — Combine scores
- `src/lib/server/retrieval/rrf-combiner-utils.ts` — Utilities

**Multi-Vector Variants**:
- `src/lib/server/retrieval/rrf-multi-vector.ts` — Multi-vector RRF
- `src/lib/server/retrieval/multi-vector-rrf.ts` — Alternative multi-vector
- `src/lib/server/retrieval/rrf-lane-ranker.ts` — Lane-specific ranking

**Main Implementation**:
- `src/lib/server/retrieval/rrf-fusion.ts` — Main RRF fusion (check weight config)

**Weight Config** (Update needed for latent_64):
```typescript
// Current (4 lanes)
weights: {
  content: 0.40,
  summary: 0.25,
  title: 0.20,
  signature: 0.15,
}

// Needed (5 lanes)
weights: {
  content: 0.35,
  summary: 0.20,
  title: 0.15,
  signature: 0.10,
  latent_64: 0.20,  // ← NEW
}
```

**Integration Tests**:
- `src/lib/server/retrieval/rrf-integration.ts` — Integration test
- `src/lib/server/retrieval/rrf-integration-tests.ts` — Extended tests
- `src/lib/server/retrieval/rrf-local-testing.ts` — Local test helpers

---

### Msgpack Serialization (Complete)

**Codec**:
- `src/lib/server/serialization/packet-msgpack-codec.ts` — Full implementation
  - `encodeFP16()` / `decodeFP16()` — 128 bytes for latent_64
  - `encodeFP32()` / `decodeFP32()` — For manifold_4d
  - `PacketMsgpackTags` enum (0-29 fixed-map entries)
  - `encodePacketBatchToNdjsonMsgpack()` — Batch streaming

**Packet Shape**:
- `src/lib/schemas/packet-canonical.ts` — Canonical packet (all 40+ fields)
- `src/lib/server/ace/canonical-packet-envelope.ts` — ACE envelope type

---

### Topology & Neo4j

**Neo4j Schema**:
- `src/lib/server/db/schema/topology.ts` — Node/edge definitions
- `src/lib/server/db/neo4j-gds.ts` — GDS client

**Neo4j Orchestration**:
- `src/lib/server/graph/neo4j-gds-orchestrator.ts` — Orchestrator
- `src/lib/server/graph/neo4j-gds-retrieval.ts` — GDS-based retrieval
- `src/lib/server/graph/topology-ontology.ts` — Ontology extraction

**SOM Pipeline**:
- `src/lib/server/graph/som-topology-pipeline.ts` — SOM→Neo4j (check if complete)

**Sync**:
- `src/lib/server/dispatcher/neo4j-mirror-sync.ts` — Mirror sync
- `src/lib/server/graph/pg-neo4j-sync.ts` — Generic Postgres→Neo4j sync
- `src/lib/server/graph/codebase-neo4j-sync.ts` — Codebase-specific sync

**Export**:
- `src/lib/server/graph/neo4j-jsonl-exporter.ts` — Export for analytics

---

### ACE Barrel & I/O (Just Restored)

**Barrel** (Restored):
- `src/lib/server/ace/index.ts` — Re-export barrel
  - Reader: `AcePacketReader`, `createAcePacketReader`
  - Writer: `AcePacketWriter`, `createAcePacketWriter`
  - Validator: `AcePacketValidator`, `createAcePacketValidator`
  - Serialization: msgpack codec exports

**Reader**:
- `src/lib/server/ace/ace-packet-reader.ts` — Load packets from Postgres/Redis

**Writer**:
- `src/lib/server/ace/ace-packet-writer.ts` — Persist packets to Postgres/Redis

**Validator**:
- `src/lib/server/ace/ace-packet-validator.ts` — Schema validation + injection guard

---

### Postgres Schemas

**Main Schema**:
- `src/lib/server/db/schema-postgres.ts` — Drizzle schema (all 70+ tables)
  - Table: `atlas_packets` (packet_key, feature_id, source_ref, domain, title_id, latent_64, etc.)
  - Table: `codebase_chunk_index` (content chunks with content_embedding)

**Schema Variants**:
- `src/lib/server/db/schema-atlas-registry.ts` — Atlas registry schema
- `src/lib/server/db/schema/packet-metadata-v1.ts` — Packet metadata v1
- `src/lib/server/db/schema/packet-topology-projection.ts` — Topology projection
- `src/lib/server/db/schema/topology.ts` — Topology schema (Neo4j mirroring Postgres)

---

## TIER 4: ROUTES & API ENDPOINTS

### Retrieval Routes

- `src/routes/api/retrieval/search-unified/+server.ts` — Canonical SearchRuntime endpoint
- `src/routes/api/retrieval/rrf/+server.ts` — RRF-specific endpoint

### Search Routes

- `src/routes/api/search/rrf/+server.ts` — Legacy RRF endpoint
- `src/routes/api/codebase/search/multi-vector/+server.ts` — Multi-vector search
- `src/routes/api/codebase/rerank/+server.ts` — Reranking endpoint
- `src/routes/api/codebase-index/gpu-pipeline/+server.ts` — GPU pipeline

### Admin Routes

- `src/routes/api/admin/atlas/hyperrag/+server.ts` — Admin HyperRAG

### Feature Labels Routes

- `src/routes/api/atlas/feature-labels/+server.ts` — Feature labels API

---

## Summary: Files to Create/Modify

### CREATE (9 files):
1. `src/lib/server/neo4j/gds-pagerank-batch.ts`
2. `scripts/atlas/train-autoencoder-128.mjs`
3. `src/lib/server/retrieval/rrf-multi-vector-with-latent.ts`
4. `src/lib/server/retrieval/promote-results-neo4j.ts`
5. `src/lib/server/retrieval/title-generator.ts`
6. `src/lib/server/topology/som-to-neo4j-fan-out.ts`
7. `src/lib/server/vector/autoencoder-training-pipeline.ts`
8. `tests/e2e/search-to-xgboost.test.ts`
9. `scripts/atlas/gds-pagerank-compute.mjs`

### MODIFY (3 files):
1. `src/lib/server/retrieval/search-runtime.ts` — Add domain classifier + title gen calls
2. `src/lib/server/retrieval/rrf-fusion.ts` — Add 5th lane weight (latent_64)
3. `src/lib/server/retrieval/promote-results-outbox.ts` — Hook Neo4j fan-out

### READ ONLY (reference):
- `src/lib/server/classifier/domain-classifier.ts` — Copy implementation
- `src/lib/server/labels/feature-label-registry.ts` — Check existing patterns
- `src/lib/server/serialization/packet-msgpack-codec.ts` — FP16/FP32 ready
- `src/lib/server/ace/index.ts` — Barrel re-exports (reader/writer/validator)
