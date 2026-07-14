# End-to-End Gaps: Domain Classifier + Cross-Reranker → XGBoost/RL

**Date**: July 13, 2026  
**Status**: Gap Analysis Complete

---

## Pipeline Overview

```
SearchRuntime (4 lanes: BM25, Qdrant, AST, exact)
  ↓ RRF fusion (k=60)
  ↓ Cross-Encoder Reranker (Mixedbread/BGE)
  ↓ Domain Classifier (legal/graph/ml/agent/general)
  ↓ Title Generator (feature labels)
  ↓ Topology Enrichment (SOM, K-Means, Neo4j GDS PageRank)
  ↓ Latent Compression (AE 768→128, then 128→64)
  ↓ Qdrant Multi-Vector Storage (content/summary/title/signature + latent64)
  ↓ Postgres Atomic Write (atlas_packets + latent_64 bytea)
  ↓ Token Remapping (msgpack FP16/FP32 serialization)
  ↓ XGBoost/RL Training Dataset
```

---

## Gap Inventory (Critical → Implementation Ready)

### TIER 1: CRITICAL GAPS (Missing Infrastructure)

#### 1. Neo4j GDS PageRank Computation
**Status**: ❌ **NOT WIRED**  
**Current**: 
- Schemas reference `neo4j_pagerank_score` / `page_rank_score` columns
- Domain classifier keyword recognizes "pagerank"
- `langgraph-research.ts` reads `neo4j_pageRankScore` from payloads (fallback: `pagerank_score`)

**Missing**:
- ❌ No `CALL gds.pageRank.stream()` cypher execution in codebase
- ❌ No scheduled batch PageRank job (daily/weekly refresh)
- ❌ No CouchDB materialized view for `couchdb:pagerank_scores` (6h TTL cache)
- ❌ No fan-out to Qdrant payload after compute

**Fix Required**:
```typescript
// File needed: src/lib/server/neo4j/gds-pagerank-batch.ts
// 1. Match (n:CodebaseFile) → compute PageRank
// 2. Write results to Neo4j node.pagerank_score
// 3. Export to CouchDB view
// 4. Fan-out to Qdrant payload update
// Schedule: npm run graph:pagerank:compute (daily)
```

---

#### 2. Latent128 Autoencoder Training & Population
**Status**: ❌ **SCHEMA DEFINED, IMPLEMENTATION MISSING**  
**Current**:
- Schema: `atlas_packets.latent_128` (bytea, optional)
- Qdrant collection: `codebase_topology_128` defined
- Config: `vectorSlotFor()` recognizes 128-dim (latent_128)
- Autoencoder: `autoencoder-compression.ts` has quantize/dequantize helpers

**Missing**:
- ❌ No AE training pipeline (768-dim → 128-dim)
- ❌ No batch encoding script (`scripts/compress:latent128:apply`)
- ❌ No Qdrant upsert to `codebase_topology_128` collection
- ❌ No Neo4j node.latent_128 property population

**Fix Required**:
```typescript
// File needed: scripts/atlas/train-autoencoder-128.mjs
// 1. Load 384-dim embeddings from codebase_chunk_index
// 2. Train AE: 384 → 128 bottleneck (optional)
// 3. Encode all packets: 384-dim → 128-dim
// 4. Store to atlas_packets.latent_128 (bytea)
// 5. Upsert to Qdrant codebase_topology_128
```

---

#### 3. Latent64 Storage & Qdrant RRF Fusion
**Status**: ⚠️ **SCHEMA READY, FUSION NOT WIRED**  
**Current**:
- Schema: `atlas_packets.latent_64` (bytea, populated)
- Msgpack codec: FP16 encoding/decoding in `packet-msgpack-codec.ts` ✅
- Qdrant: latent64 named vector defined in multi-vector schema
- Quantization: INT8 helpers in `autoencoder-compression.ts` ✅

**Missing**:
- ❌ No Qdrant RRF fusion that includes latent_64 lane
- ❌ No weight configuration for latent_64 in RRF (currently only: content/summary/title/signature)
- ❌ No scoring function: how to blend semantic (768) + topology (64) results
- ❌ No fan-out from Postgres bytea → Qdrant payload.latent_64 (binary blob)

**Current RRF Weight Config** (in `rrf-fusion.ts` or similar):
```typescript
// EXISTING (4 lanes)
weights: {
  content_embedding: 0.40,
  summary_embedding: 0.25,
  title_embedding: 0.20,
  signature_embedding: 0.15,
}

// MISSING (add latent_64 as 5th lane)
weights: {
  content_embedding: 0.35,
  summary_embedding: 0.20,
  title_embedding: 0.15,
  signature_embedding: 0.10,
  latent_64: 0.20,  // ← NEW: topology similarity
}
```

**Fix Required**:
```typescript
// File: src/lib/server/retrieval/rrf-multi-vector-with-latent.ts
// 1. Search Qdrant latent_64 lane alongside content/summary/title/signature
// 2. RRF combine 5 lanes (k=60)
// 3. Re-fetch latent_64 from Postgres for top-K winners
// 4. Blend topology score into final ranking
```

---

#### 4. Neo4j GDS Fan-Out (Postgres → Neo4j)
**Status**: ❌ **NOT WIRED**  
**Current**:
- Neo4j has topology edges (IMPORTS, SIMILAR_TOPOLOGY, etc.)
- Specialist-team mentions "Neo4j relationships" as acceptance gate
- langgraph-research reads `neo4j_gpuCluster` from payloads

**Missing**:
- ❌ No promotion pipeline that writes to Neo4j after Postgres
- ❌ No schema for Neo4j properties (latent_128, latent_64 as node properties)
- ❌ No trigger to compute GDS metrics (PageRank, community detection) after node creation

**Fix Required**:
```typescript
// File: src/lib/server/retrieval/promote-results-neo4j.ts (NEW)
// After promotion to Postgres:
// 1. MATCH packet_key in Neo4j CodebaseFile node
// 2. SET node.latent_128, node.latent_64 (from Postgres bytea)
// 3. SET node.domain_class, node.title_id, node.confidence_score
// 4. Trigger GDS: CALL gds.pageRank.stream() for updated node set
```

---

### TIER 2: IMPLEMENTATION READY (Defined, Needs Wiring)

#### 5. Domain Classifier Integration into SearchRuntime
**Status**: ✅ **CODE EXISTS, NOT CALLED**  
**Current**:
- `domain-classifier.ts` classifies text into legal/graph/ml/agent/general
- Keywords defined per domain
- Used in MCP server (optional tool call)

**Missing**:
- ❌ Not called in canonical SearchRuntime.search() pipeline
- ❌ No domain field written to `atlas_packets.domain`
- ❌ No domain-aware reranking boost

**Fix Required**:
```typescript
// In search-runtime.ts step 6 (after rerank, before promotion):
const domain = classifyDomainFromText(packet.summary || packet.title || '');
packet.domain = domain;  // Store before upsert to Qdrant
```

---

#### 6. Cross-Encoder Reranker Cache Integration
**Status**: ✅ **CODE EXISTS, REDIS CACHING WIRED**  
**Current**:
- `cross-encoder-reranker.ts` has L0 (result-set) + L1 (pair score) caching
- Backend: Triton (primary), fallback to Ollama
- Fallback to web search if confidence < 0.45

**Status**: ✅ **READY FOR PRODUCTION**  
**No fix needed** — already integrated into SearchRuntime step 4 (rerank).

---

#### 7. Title Generation (Feature Labels)
**Status**: ⚠️ **SCHEMA DEFINED, GENERATION MISSING**  
**Current**:
- Schema: `atlas_packets.title_id` (string, optional)
- Canonical schema: `feature_label` defined

**Missing**:
- ❌ No LLM pipeline to generate concise titles from code snippets
- ❌ No caching (Redis: `title:packet:{key}`)
- ❌ No deterministic hashing to avoid duplicate generation

**Fix Required**:
```typescript
// File: src/lib/server/retrieval/title-generator.ts (NEW)
// Input: packet (code + summary)
// Output: feature_label (2-5 words)
// Example: "User session validator" for auth.sessions
// Use: Gemma4 or Ollama (10-token budget, deterministic temp=0)
```

---

#### 8. SOM Clustering & K-Means Integration
**Status**: ✅ **GPU WIRED, QDRANT PAYLOAD NEEDS UPDATE**  
**Current**:
- SOM training: `src/lib/gpu/som-trainer.ts` (PyTorch)
- K-Means: GPU-accelerated via tensorrt_bridge
- Payload: `som_cluster` already in Qdrant

**Missing**:
- ⚠️ No post-SOM fan-out to Neo4j (create SOM node, BELONGS_TO_CLUSTER edge)
- ⚠️ No Neo4j SOM node properties (center_id, grid_coordinates)

**Fix Required**:
```typescript
// File: src/lib/server/topology/som-to-neo4j-fan-out.ts (NEW)
// After SOM training:
// 1. MERGE SOM cluster node (som_cluster_id as unique key)
// 2. CREATE BELONGS_TO_CLUSTER edges from file nodes
// 3. Store som_row, som_col as node properties
```

---

### TIER 3: VALIDATION & TESTING

#### 9. End-to-End Test: Query → Rerank → Domain → Topology → Promotion → XGBoost Export
**Status**: ⚠️ **PARTIAL**  
**Tests Exist For**:
- ✅ SearchRuntime 10-step pipeline (`search-runtime.spec.ts`)
- ✅ Cross-encoder reranker (`cross-encoder-reranker.ts` has unit tests)
- ✅ RRF fusion (`rrf-integration.ts`, `rrf-integration-tests.ts`)

**Tests Missing For**:
- ❌ Domain classifier in SearchRuntime context
- ❌ Neo4j GDS PageRank computation (no test harness)
- ❌ Latent128/64 storage + Qdrant upsert
- ❌ Title generation integration
- ❌ Token remapping (msgpack serialization → XGBoost dataset)

**Fix Required**:
```bash
npm run test:e2e:search-to-xgboost
# Orchestrates: SearchRuntime → promotion → Neo4j GDS → token remapping → dataset verify
```

---

## Summary: Critical Path to XGBoost Ready

| Priority | Component | Status | Dependencies |
|----------|-----------|--------|--------------|
| **P0** | Neo4j GDS PageRank | ❌ Missing | Neo4j health, Cypher CALL gds |
| **P0** | Latent128 AE Train | ❌ Missing | GPU autoencoder, 768→128 |
| **P0** | Latent64 Qdrant RRF | ⚠️ Partial | 5-lane RRF config, latent fan-out |
| **P1** | Neo4j Fan-Out | ❌ Missing | P0 Postgres write, neo4j promotion |
| **P1** | Domain Classifier Wire | ✅ Ready | Just call in SearchRuntime step 6 |
| **P1** | Title Generator | ⚠️ Schema only | LLM call for feature labels |
| **P2** | SOM→Neo4j Fan-Out | ⚠️ Partial | SOM compute done, Neo4j write missing |
| **P2** | E2E Test Suite | ⚠️ Partial | All P0/P1 components complete |

---

## Recommended Execution Order

```
Week 1:
  1. Wire domain classifier into SearchRuntime (1h, unlocks Tier 2)
  2. Neo4j GDS PageRank batch job (3h)
  3. Test Neo4j fan-out from promotion (2h)

Week 2:
  4. Latent128 AE training + population (4h)
  5. Latent64 Qdrant RRF 5-lane fusion (3h)
  6. Title generator pipeline (2h)

Week 3:
  7. Neo4j SOM→cluster edges (1h)
  8. E2E test suite (4h)
  9. Token remapping → XGBoost dataset export (3h)

Total: ~23 hours to full XGBoost readiness
```

---

## Files to Create/Modify

**New Files** (9 total):
1. `src/lib/server/neo4j/gds-pagerank-batch.ts`
2. `scripts/atlas/train-autoencoder-128.mjs`
3. `src/lib/server/retrieval/rrf-multi-vector-with-latent.ts`
4. `src/lib/server/retrieval/promote-results-neo4j.ts`
5. `src/lib/server/retrieval/title-generator.ts`
6. `src/lib/server/topology/som-to-neo4j-fan-out.ts`
7. `src/lib/server/token-map/token-remapping-rl-export.ts`
8. `tests/e2e/search-to-xgboost.test.ts`
9. `scripts/atlas/gds-pagerank-compute.mjs`

**Modify** (3 total):
- `search-runtime.ts` — add domain classifier call, latent64 serialization
- `rrf-fusion.ts` — add 5th lane (latent_64) with weight
- `promote-results.ts` — fan-out to Neo4j after Postgres write

**No Changes** (already ready):
- ✅ Cross-encoder reranker (wired)
- ✅ Msgpack codec (complete)
- ✅ ACE packet reader/writer (restored)
- ✅ SearchRuntime core (10 steps done)
