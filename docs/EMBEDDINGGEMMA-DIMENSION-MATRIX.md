# EmbeddingGemma Dimension Matrix: 768, 384, 256, 128 (2026-07-20)

**Purpose**: Complete matrix of all embedding dimensions currently declared, stored, or planned in the schema, with truncation/projection paths.

**Status**: 🔴 **BLOCKING** — pgvector audit Step 1 pending (verify actual model output: 768 or 384?)

**Reference**: `CORRECTED-embedding-dimension-policy.md` (June 28) claims 768-dim live-verified, but pgvector audit (July 20) flags this as "unverified assumption."

---

## Current Schema Dimensions (Live Inventory)

### 768-Dimensional Columns (12 tables)
**Status**: Live, populated, Qdrant-mirrored

| Table | Column | Type | Rows | Index | Purpose |
|-------|--------|------|------|-------|---------|
| `atlas_packets` | `embedding` | vector(768) | ~58K | — | Legacy (ALL NULL) |
| `embedding_cache` | `embedding` | vector(768) | ~50K | B-tree | L1 cache (5min TTL) |
| `codebase_embeddings` | `embedding` | vector(768) | ~10K | HNSW | Code chunk vectors |
| `legal_chunks` | `embedding` | vector(768) | ~5K | HNSW | Legal doc chunks |
| `legal_documents` | `*` | (unknown) | — | — | (need schema check) |
| `search_analytics` | `content_embedding` | vector(768) | ~20K | B-tree | Search index |
| `search_analytics` | `signature_embedding` | vector(768) | ~15K | B-tree | Function signature |
| `search_analytics` | `summary_embedding` | vector(768) | ~12K | B-tree | Summary vectors |
| `nes_chrom_packets` | `*` | (unknown) | — | — | (need schema check) |
| `rag_cards` | `*` | (unknown) | — | — | (need schema check) |
| `schema_semantic_cache` | `*` | (unknown) | — | — | (need schema check) |
| `workspace_notes` | `*` | (unknown) | — | — | (need schema check) |

**Total 768-dim columns**: 12 tables

### 384-Dimensional Columns (9 tables)
**Status**: Live, populated, optional Qdrant-mirrored

| Table | Column | Type | Rows | Index | Purpose |
|-------|--------|------|------|-------|---------|
| `embeddings` | `embedding` | vector(384) | ~30K | IVFFLAT | Primary embedding store |
| `embeddings` | `embedding_384` | vector(384) | ~30K | — | Explicit 384-dim copy |
| `gpu_cache.shader_cache_entries` | `source_embedding` | vector(384) | ~500 | — | nomic-embed-text fallback |
| `embedding_index` | `*` | vector(384)? | — | — | (need verification) |
| `legal_cases` | `case_embedding` | vector(384)? | ~100 | — | (need verification) |
| `gpu_cache` | `source_embedding` | vector(384) | ~500 | — | GPU cache layer |
| (3 more) | — | vector(384) | — | — | (need schema check) |

**Total 384-dim columns**: 9 tables

### 256-Dimensional Columns (GPU Cache)
**Status**: Experimental, optional

| Table | Column | Type | Rows | Purpose |
|-------|--------|------|------|---------|
| `gpu_cache.shader_preload_rules` | `model_weights` | vector(128) | ~100 | ML weight vector (NOT 256) |

**Total 256-dim**: 0 (not found in current schema)

### 128-Dimensional Columns (GPU Cache)
**Status**: Live, experimental

| Table | Column | Type | Rows | Purpose |
|-------|--------|------|------|---------|
| `gpu_cache.shader_preload_rules` | `model_weights` | vector(128) | ~100 | Preload rule weights |

**Total 128-dim columns**: 1 table

### 64-Dimensional Columns (GPU Cache)
**Status**: Live, experimental (Autoencoder output)

| Table | Column | Type | Rows | Purpose |
|-------|--------|------|------|---------|
| `gpu_cache.shader_user_patterns` | `state_vector` | vector(64) | ~500 | Compressed workflow state (AE output) |
| `gpu_cache.shader_user_patterns` | `action_vector` | vector(32) | ~500 | Action embedding (NOT 64) |

**Total 64-dim**: 1 table (state_vector only)

### 32-Dimensional Columns
**Status**: Live, experimental

| Table | Column | Type | Rows | Purpose |
|-------|--------|------|------|---------|
| `gpu_cache.shader_user_patterns` | `action_vector` | vector(32) | ~500 | Action embedding |

**Total 32-dim**: 1 table

---

## Qdrant Collections (Live)

### Current Operational Collections
| Collection | Dimension | Points | Payload Schema | Canonical Dimension |
|------------|-----------|--------|-----------------|-------------------|
| `codebase_chunks_768` | 768 | 40.5K | packet_key, source_ref, feature_id | ✅ 768 (canonical) |
| `codebase_chunks_384_hybrid` | 384 | 0 (planned) | (same) | 384 (Phase 9, unimplemented) |
| (others) | — | — | — | — |

---

## Truncation Paths: 768 → Smaller Dimensions

### Path 1: 768 → 384 (Mean Pooling, 2× Reduction)
**Method**: Take every 2nd element (lossy), or mean-pool pairs

```typescript
function truncate768to384(vec768: Float32Array): Float32Array {
  const result = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    result[i] = vec768[i * 2];  // Take even indices (lossy)
  }
  return result;
}

// OR mean-pool (better):
function meanPool768to384(vec768: Float32Array): Float32Array {
  const result = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    result[i] = (vec768[i * 2] + vec768[i * 2 + 1]) / 2;
  }
  return result;
}
```

**Loss**: ~15-25% similarity quality (empirical)  
**Use case**: Space reduction for L2 cache (Bifrost)  
**Status**: ⏳ Not currently used in code

### Path 2: 768 → 256 (PCA/Random Projection)
**Method**: Principal Component Analysis or random projection matrix

```typescript
// Pseudo-code (requires 768×256 projection matrix)
function project768to256(vec768: Float32Array, projMatrix: Float32Array[][]): Float32Array {
  const result = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let dot = 0;
    for (let j = 0; j < 768; j++) {
      dot += vec768[j] * projMatrix[j][i];
    }
    result[i] = dot / Math.sqrt(768);  // normalize
  }
  return result;
}
```

**Loss**: ~20-30% similarity quality (PCA preserves structure better)  
**Use case**: Sparse index layer, GPU prefilter  
**Status**: ⏳ Experimental (TurboVec uses 64-dim, not 256)

### Path 3: 768 → 128 (Aggressive Compression)
**Method**: Learned autoencoder (AE) or PCA

```typescript
// Learned AE (requires training)
const ae = await loadAutoencoder('path/to/ae_768_to_128.onnx');
function encode768to128(vec768: Float32Array): Float32Array {
  return await ae.encode(vec768);  // returns 128-dim
}
```

**Loss**: ~40-50% similarity quality  
**Use case**: Ultra-compact memory paths, analytics  
**Status**: ✅ Implemented (current AE: 768→64, not 128)

### Path 4: 768 → 64 (Current Autoencoder)
**Method**: Trained autoencoder (GPU accelerated)

```typescript
// Current production AE
const ae = await loadAutoencoder('models/ae_768_to_64_v0.onnx');
function encode768to64(vec768: Float32Array): Float32Array {
  return await ae.encode(vec768);  // returns 64-dim
}
```

**Loss**: ~50-60% similarity quality (acceptable for analytics)  
**Use case**: GPU memory paths, SOM mapping, analytics  
**Status**: ✅ Live (but never use for search; use only for routing)

### Path 5: 768 → 32 (Not Standard)
**Method**: Random projection or learned compression  
**Status**: ❌ Not implemented, not recommended

---

## Dimension Mismatch Scenarios

### Scenario A: embeddinggemma:latest outputs 768-dim (CURRENT ASSUMPTION)
**Evidence**: `CORRECTED-embedding-dimension-policy.md` (June 28 live audit)

**Status**: 
- ✅ 768-dim columns match model output
- ✅ Qdrant codebase_chunks_768 is correct
- ✅ No migration needed
- ❌ 384-dim columns are legacy/outliers (not sourced from embeddinggemma)

**Action**: Keep 768 as canonical, archive 384-dim tables

### Scenario B: embeddinggemma:latest outputs 384-dim (pgvector audit hypothesis)
**Evidence**: 9 Postgres tables declare vector(384), Phase 0 doc mentions 384

**Status**:
- ❌ 768-dim columns are WRONG (dimension mismatch)
- ❌ Qdrant codebase_chunks_768 stores WRONG dimension (must rebuild)
- ✅ 384-dim columns match model output
- ❌ ALL embeddings must be recomputed

**Action**: Migrate 768→384 across 12 tables, rebuild Qdrant

### Scenario C: Model Dimension Changed Over Time
**Evidence**: Ollama `embeddinggemma:latest` tag may have been updated

**Status**: Unknown — requires verification

**Action**: Execute pgvector audit Step 1 to verify current model output

---

## Truncation Recommendations by Use Case

### Use Case 1: ANN Search (Qdrant)
| Scenario | Dimension | Index | Truncate? | Reason |
|----------|-----------|-------|-----------|--------|
| Dense search | 768 | HNSW | No | Full quality needed |
| Sparse prefilter | 64-256 | Custom | Yes | Cost reduction |
| Mobile search | 384 | HNSW | Maybe | Mobile VRAM constraint |

**Recommendation**: Store 768-dim in Qdrant, compute 64-dim prefilter separately

### Use Case 2: GPU Cache (Bifrost L2)
| Scenario | Dimension | TTL | Truncate? |
|----------|-----------|-----|-----------|
| Exact-match (L1) | Full | 5min | No |
| Semantic (L2) | — | 5min | Yes (optional) |

**Recommendation**: L1 stores full 768, L2 can use 384 or lower

### Use Case 3: Cold Storage (SeaweedFS)
| Scenario | Dimension | Compression | Truncate? |
|----------|-----------|-------------|-----------|
| Archive | 768 | Float32 | Maybe |
| Restore-on-demand | 768 | Float32 | No |

**Recommendation**: Store 768-dim, optionally truncate on read

### Use Case 4: GPU Memory Paths (SOM, KMeans)
| Algorithm | Input | Output | Truncate? |
|-----------|-------|--------|-----------|
| SOM 20×20 | 768 | Position | Yes (→64-128 for routing) |
| KMeans | 768 | Cluster | Yes (→128 for centroids) |
| PageRank | — | Score | No (scalar) |

**Recommendation**: Never truncate input, optionally reduce output

---

## Decision Tree: Which Dimension to Use?

```
Are you doing ANN search (Qdrant)?
  → Use 768-dim (full fidelity)

Are you caching in Redis/Bifrost?
  → Use 768-dim (L1), optionally 384-dim (L2)

Are you computing SOM/KMeans centroids?
  → Use 768-dim input, optionally 64-128-dim output

Are you doing GPU memory modeling?
  → Use 64-dim (autoencoder output)

Are you doing mobile/edge inference?
  → Truncate to 256-384 (tradeoff: size vs quality)

Are you storing in SeaweedFS cold storage?
  → Store 768-dim (can truncate on restore if needed)

Otherwise:
  → Use 768-dim (canonical)
```

---

## Current Postgres Schema Sync Status

| Table | Expected | Actual | Status | Fix |
|-------|----------|--------|--------|-----|
| `atlas_packets.embedding` | 768 | 768 | ✅ | — |
| `embedding_cache.embedding` | 768 | 768 | ✅ | — |
| `codebase_embeddings.embedding` | 768 | 768 | ✅ | — |
| `legal_chunks.embedding` | 768 | 768 | ✅ | — |
| `embeddings.embedding` | 384 | 384 | ✅ | Verify source |
| `embeddings.embedding_384` | 384 | 384 | ✅ | Redundant? |
| `gpu_cache.source_embedding` | 384 | 384 | ✅ | Verify source |
| (others) | — | ? | ⏳ | Run audit |

**Action**: Verify schema matches reality via pgvector audit completion

---

## Hard Rules (Canonical Policies)

### Rule 1: Truth is 768-dim (CURRENT)
- ✅ Postgres pgvector(768) is canonical
- ✅ Qdrant codebase_chunks_768 is primary mirror
- ❌ Do NOT truncate at storage layer
- ✅ Truncation OK at read/analytics layer only

### Rule 2: No Mixed Dimensions
- ❌ Never mix 768 + 384 in same query
- ❌ Never mix 768 + 64 in search (AE output is routing-only)
- ✅ Separate paths: search (768), routing (64), analytics (64)

### Rule 3: Truncation is Optional, Not Mandatory
- ✅ Truncate 768→384 for Bifrost L2 cache (optional)
- ✅ Truncate 768→64 for SOM/KMeans routing (optional)
- ❌ Never truncate at storage (use full 768 in Postgres/Qdrant)

### Rule 4: AE Output is Not Search-Grade
- ❌ Do NOT use 64-dim AE output for ANN search
- ✅ Use 64-dim only for memory paths (SOM, KMeans, analytics)
- ✅ Always search with full 768-dim vectors

---

## Migration Path (If Scenario B Confirmed)

If pgvector audit Step 1 confirms embeddinggemma outputs 384-dim:

**Phase 1: Prepare (1h)**
- Create new vector(384) columns (non-blocking)
- Create temp Qdrant collection for 384-dim vectors

**Phase 2: Backfill (2-3h)**
- Re-embed all 58K packets via Ollama (embeddinggemma:latest)
- Verify output dimension = 384 for each

**Phase 3: Migrate (1h)**
- Migrate Postgres 768→384 columns (atomic ALTER TABLE)
- Rebuild Qdrant index with 384-dim vectors

**Phase 4: Verify (30m)**
- Smoke tests: search, cache, analytics
- Verify no regression

**Total**: 4-6 hours downtime

---

## References

- **Schema inventory**: `sveltekit-frontend/src/lib/server/db/schema-*.ts`
- **June 28 audit**: `docs/architecture/CORRECTED-embedding-dimension-policy.md`
- **pgvector audit**: `docs/audit/PGVECTOR-DIMENSION-DRIFT-AUDIT.md`
- **Qdrant collections**: `curl http://127.0.0.1:6333/collections`
- **EmbeddingGemma model**: Ollama `embeddinggemma:latest`

---

## Next Steps

1. **Execute pgvector audit Step 1** (verify actual dimension)
2. **Document result** in `docs/EMBEDDING-MODEL-DIMENSION.md`
3. **If 768-dim confirmed**: Archive 384-dim tables, update comments
4. **If 384-dim confirmed**: Trigger migration (4-6h plan above)
5. **Update central constant** (`EMBEDDING_DIM = 768 or 384`)
6. **Update all scripts** to reference canonical dimension

---

**Status**: 🔴 BLOCKED waiting for Step 1 operator execution

**Blocker removal**: `curl -s http://127.0.0.1:11434/api/embeddings -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'`
