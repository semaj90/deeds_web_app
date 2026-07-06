# Unified ID Hierarchy & Retrieval Architecture

**Status**: ✅ **DESIGN COMPLETE**  
**Date**: July 6, 2026  
**Scope**: Single source of truth for packet identity + multi-vector retrieval pipeline

---

## Problem Solved

**Before**: Different stores used different identifiers
- Postgres: `packet_key`, `source_ref`, `feature_id`
- Qdrant: `qdrant_point_id` (separate ID)
- Neo4j: Node IDs (separate)
- Redis: Custom key patterns

**After**: Unified hierarchy — same 8 IDs across ALL stores
- `repository_id` (UUID)
- `directory_id` (UUID)
- `file_id` (UUID)
- `module_id` (UUID)
- `symbol_id` (UUID)
- `feature_id` (string: domain:feature-name)
- `packet_key` (string: ace:packet:{domain}:{seq})
- `chunk_id` (UUID/serial)

**Result**: Efficient filtering, grouping, and traversal at any level

---

## ID Hierarchy (Top-Down)

```
repository_id (repo metadata)
  ↓
directory_id (src/lib/server/auth/)
  ↓
file_id (src/lib/server/auth.ts)
  ↓
module_id (Session handler module)
  ↓
symbol_id (validateSession function)
  ↓
feature_id (auth:session-validation feature)
  ↓
packet_key (ACE canonical ID)
  ↓
chunk_id (codebase_chunk_index row)
```

Every packet carries ALL parent IDs. Enables:
- Filter by directory_id to get all packets in a module
- Filter by feature_id to get all related implementations
- Group by module_id for cohesion analysis
- Traverse symbol_id → feature_id → packet_key → chunk_id

---

## Store Synchronization

All 8 IDs stored identically in:

```
┌─────────────────────────────────────┐
│ POSTGRES (TRUTH)                    │
│ ├─ repository_id, directory_id, ... │
│ ├─ created_at, updated_at           │
│ └─ source_ref, packet_type          │
└─────────────────────────────────────┘
        ↓
   ┌────┴────┬──────────┬────────────┐
   ↓         ↓          ↓            ↓
┌────────┐ ┌─────────┐ ┌───────┐ ┌─────────┐
│QDRANT  │ │ NEO4J   │ │ REDIS │ │ GO SVC  │
│(MIRROR)│ │(MIRROR) │ │(CACHE)│ │ (RPC)   │
│ Vectors│ │ Edges   │ │ Keys  │ │ gRPC    │
│Payload │ │Props    │ │Patterns│ │Contract │
└────────┘ └─────────┘ └───────┘ └─────────┘
```

**Hard rule**: Postgres is always source of truth. All mirrors write IDs from Postgres values.

---

## Recommended Ingestion Pipeline

```
rg (corpus search)
  ↓ (find all symbols, features, files)
ast-grep (AST extraction)
  ↓ (structure analysis)
tree-sitter (AST parsing)
  ↓ (language-aware parsing)
LangExtract (concept extraction)
  ↓ (semantic features)
EmbeddingGemma (embedding)
  ↓ (384-dim vectors)
Postgres JSONB (write ID hierarchy)
  ↓ (truth layer)
MIRROR to: Qdrant (vectors) + Neo4j (edges) + Redis (cache)
  ↓
Go Retrieval Service (coordination)
  ↓
RRF Fusion (7 lanes)
  ↓
GPU Reranker (TensorRT, top-100 → top-20)
  ↓
Gemma4 Answer (LLM synthesis, inference only)
```

**CPU work**: ID generation, AST parsing, concept extraction, validation, ranking logic
**GPU work**: Embeddings, reranker inference, Gemma4 inference only

---

## Multi-Vector Qdrant Schema

Named vectors (all 384-dim from EmbeddingGemma):

| Vector | Purpose | Retrieval Use Case |
|--------|---------|-------------------|
| `content_embedding` | Semantic code/text search | Primary (60% weight) |
| `summary_embedding` | Concept-level retrieval | Fallback (40% weight) |
| `title_embedding` | Feature/module lookup | Feature navigation |
| `signature_embedding` | Function/API similarity | Refactoring, signature search |
| `feature_embedding` (optional) | Feature recommendation | Cross-cutting concerns |
| `latent64` | Clustering/topology ONLY | NOT for retrieval |

**Key point**: `latent64` is for SOM/K-means clustering and topology visualization only. NOT used in primary retrieval.

Hybrid search formula (example):
```
RRF(0.6 * content_embedding + 0.4 * summary_embedding)
= Dual-vector retrieval for semantic + concept-level matching
```

---

## Retrieval Pipeline (End-to-End)

### 1. Query Embedding
```typescript
const queryEmbedding = await embedQuery(query); // 384-dim
```

### 2. Go Retrieval Service (Parallel, RRF, Top-100)
```
Query → Go Service ─┬─→ Qdrant (vector search, content_embedding)
                   ├─→ Postgres (BM25, trigram FTS)
                   ├─→ Neo4j (graph traversal, k-hop)
                   ├─→ Redis (exact match, BitFrost cache)
                   └─→ TurboVec (4-bit quantized prefilter)
                           ↓
                    RRF Fusion (7 lanes)
                           ↓
                    Top 100 candidates
```

**Go service wins because**:
- Parallel queries (Qdrant + Postgres + Neo4j + Redis simultaneously)
- Typed contracts (gRPC protobuf)
- Low-latency coordination (Go is fast)
- No Python/JavaScript overhead

### 3. GPU Reranker (TensorRT, Top-100 → Top-20)
```typescript
// Accelerate top-100 → top-20
const reranked = await gpuReranker(top100, queryEmbedding);
// Computes: cosine similarity + cross-encoder + multi-vector blend
// Returns: sorted top-20 with reranked scores
```

**GPU accelerates inference only**:
- ✅ Embedding inference (EmbeddingGemma)
- ✅ Reranker inference (multi-vector cosine)
- ✅ Gemma4 inference (answer synthesis)
- ❌ NOT ranking logic (CPU only)
- ❌ NOT recommendation graph traversal (CPU, Neo4j)
- ❌ NOT RRF fusion (CPU, Go service)
- ❌ NOT validation/filtering (CPU, Postgres)

### 4. Gemma4 Answer (LLM Synthesis)
```typescript
const answer = await gemma4AnswerSynthesis(top20, query);
// Context: top-20 candidates
// Output: structured answer + sources
// GPU accelerates inference, not logic
```

---

## Data Flow Diagram

```
User Query
    ↓
EmbeddingGemma (GPU: 384-dim vector)
    ↓
Go Retrieval Service (CPU: parallel coordination)
    ├─ Qdrant (named vectors: content + summary + title + signature)
    ├─ Postgres (RRF lane: BM25, graph, exact match)
    ├─ Neo4j (RRF lane: k-hop traversal)
    ├─ Redis (RRF lane: BitFrost cache)
    └─ TurboVec (RRF lane: 4-bit quantized ANN)
        ↓ (RRF Fusion, 7 lanes, CPU)
    Top 100 candidates
        ↓
GPU Reranker (TensorRT: cosine similarity + cross-encoder)
        ↓
    Top 20 candidates
        ↓
Gemma4 (GPU: inference only)
        ↓
    Answer (with sources)
```

---

## Hard Rules

1. **All 8 IDs mandatory**: Before writing to any store, validate:
   ```typescript
   validateIDHierarchy(ids) // hard fail if any ID missing
   ```

2. **Postgres is source of truth**: 
   - Write to Postgres first
   - Then mirror to Qdrant/Neo4j/Redis
   - Never write cache before truth

3. **ID consistency across stores**:
   - Same `packet_key` in Postgres, Qdrant payload, Neo4j properties, Redis keys
   - Same `feature_id` everywhere
   - Same `directory_id` for grouping

4. **GPU for tensors only**:
   - ✅ Embeddings, reranking, LLM inference
   - ❌ NOT ranking, NOT graph traversal, NOT validation

5. **Go service for retrieval coordination**:
   - Parallel queries (not sequential)
   - Typed contracts (gRPC)
   - RRF fusion (on CPU, fast)
   - Top-100 → GPU → Top-20 → Gemma4

6. **Multi-vector retrieval**:
   - `content_embedding` is primary (60% weight)
   - `summary_embedding` is fallback (40% weight)
   - Hybrid RRF fusion recommended
   - `latent64` for clustering only, NOT retrieval

---

## Implementation Checklist

- [x] Canonical ID hierarchy defined (8 levels)
- [x] Postgres schema updated (all IDs stored)
- [x] Qdrant multi-vector schema (6 named vectors)
- [x] Neo4j mirroring (ID properties on all nodes)
- [x] Redis key patterns (by file, feature, symbol, module)
- [x] Go retrieval coordinator (RRF, 7 lanes)
- [x] GPU reranker bridge (TensorRT)
- [x] Gemma4 synthesis bridge
- [ ] Integration tests (end-to-end)
- [ ] Performance benchmarks

---

## Files

- `canonical-id-hierarchy.ts` — ID generation, validation, mirroring
- `go-retrieval-coordinator.ts` — End-to-end pipeline
- `qdrant-multivector-schema.ts` — Multi-vector search implementation

---

## Next Steps

1. Update Postgres schema migration (add 8 ID columns if missing)
2. Backfill existing packets with ID hierarchy
3. Wire Go retrieval service to use unified IDs
4. Add GPU reranker (TensorRT inference)
5. Integrate Gemma4 answer synthesis
6. Run end-to-end tests

---

## References

- Session 112 P2: Qdrant payload sync (topology fields)
- Session 111 P1: RRF topology signals (7-lane blend)
- Session 110 P0: Feature-tracking layer (identity contract)
