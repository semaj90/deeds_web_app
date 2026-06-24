# Session 79 — Summary Pipeline Fixed: 4-Stage Architecture Ready

**Date**: 2026-06-24, Session 79  
**Status**: ✅ **SUMMARY-RANKING-RETRIEVAL PIPELINE CORRECTED | READY TO EXECUTE**

---

## Pipeline Architecture (Corrected)

The 4-stage pipeline processes summaries → embeddings → caching before latent vectors:

```
Stage 1: Gemma4 summaries
  codebase_chunk_index.content → Gemma4 /v1/chat → codebase_chunk_index.summary
           ↓
Stage 2: EmbeddingGemma embeddings + named vectors
  summary → Ollama /api/embed → halfvec(768) in Postgres + named vector in Qdrant
           ↓
Stage 3: Redis centroids (multi-hop cache)
  Directory-level mean vectors → redis:centroid:dir:{name}
           ↓
Stage 4: ACE context cache warming
  Top directories → Karpathy blend scores → Redis L1 cache
           ↓
[Later] Latent vectors (autoencoder) → SOM/KAG (separate pipeline)
```

---

## Fixes Applied to Stage 2

### Fix 1: Include qdrant_id in Query
**Before**:
```sql
SELECT id, relative_path, summary
FROM codebase_chunk_index
```

**After**:
```sql
SELECT id, relative_path, summary, qdrant_id
FROM codebase_chunk_index
```
Reason: Need qdrant_id to write named vectors to Qdrant

### Fix 2: Handle Both Single & Batch Embedding Response Shapes
**Before**:
```javascript
const embedding = embedData.embedding;
```

**After**:
```javascript
const embedding = embedData.embedding || embedData.embeddings?.[0];
if (!Array.isArray(embedding)) throw new Error('No embedding returned');
```
Reason: Ollama /api/embed can return either `{embedding: [...]}` or `{embeddings: [[...]]}` depending on input shape

### Fix 3: Use pgvector Vector Literal String Format
**Before**:
```javascript
await pool.query(
  'UPDATE codebase_chunk_index SET summary_embedding = $1::halfvec WHERE id = $2',
  [embedding, chunk.id]
);
```

**After**:
```javascript
const vectorLiteral = `[${embedding.join(',')}]`;
await pool.query(
  'UPDATE codebase_chunk_index SET summary_embedding = $1::halfvec WHERE id = $2',
  [vectorLiteral, chunk.id]
);
```
Reason: pgvector expects vector literals as `[v1,v2,...]` string, not arrays

### Fix 4: Use Qdrant Named Vectors (Not Payload)
**Before**:
```javascript
await qdrant.setPayload('codebase_chunks_768', {
  points: [{ id: qdrantId }],
  payload: { summary_embedding: embedding, summary: chunk.summary },
});
```

**After**:
```javascript
await qdrant.upsertPoints('codebase_chunks_768', {
  points: [{
    id: chunk.qdrant_id,
    vector: {
      'summary_embeddinggemma': embedding  // Named vector, not payload
    },
    payload: {
      summary: chunk.summary,
      summary_embedding_model: 'embeddinggemma:latest',
    }
  }]
});
```
Reason: 
- Named vectors enable efficient similarity search by vector name
- Separates vectors from metadata (payload)
- Allows multiple vector spaces per point (summary_embeddinggemma, latent_64, etc.)
- Prevents bloating payload with raw 768-dim arrays

---

## Execution Plan

### Phase 1: Sanity Check (Dry-Run)
```bash
# Test with 20 chunks, batch size 20, no changes applied
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=20 --batch=20 --dry-run --verbose
```
Expected: 20 chunks scanned, ~20 missing summaries identified, 0 applied

### Phase 2: Backfill Summaries (Safe Slices)
```bash
# Apply summaries to first 2,000 chunks in batches of 250
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=2000 --batch=250 --apply

# Repeat until no missing summaries remain:
# 1. Check current missing count: 
#    node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=100 --dry-run
# 2. If missing > 0: apply next 2,000
# 3. Continue until missing = 0
```

### Phase 3: Embed Summaries
```bash
# Embed all summaries in batches of 500 (Ollama is fast)
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=2 --limit=5000 --batch=500 --apply

# Repeat until all summaries are embedded
# This stores:
#   - halfvec(768) in Postgres codebase_chunk_index.summary_embedding
#   - Named vector 'summary_embeddinggemma' in Qdrant codebase_chunks_768
```

### Phase 4: Compute Centroids & Warm Cache
```bash
# Compute directory-level centroids for multi-hop caching
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=3 --apply

# Warm ACE context cache with top directories
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=4 --apply
```

### Phase 5: Latent Vectors (Separate Script)
Only after summaries + embeddings are stable:
```bash
# Autoencoder: 768d summary → 64d latent
node scripts/atlas/backfill-latent-vectors.mjs --apply --batch=100
```

---

## Data Flow Verification

**Checkpoint: After Stage 2 (Embed)**

PostgreSQL should show:
```sql
SELECT count(*) FROM codebase_chunk_index
WHERE summary IS NOT NULL 
  AND summary_embedding IS NOT NULL;
-- Expected: number of embedded chunks
```

Qdrant should have named vector:
```bash
# Verify named vector was created
curl -s http://localhost:6333/collections/codebase_chunks_768 | jq '.result.vectors_count'
```

Redis should have centroids (after Stage 3):
```bash
redis-cli KEYS 'centroid:dir:*' | wc -l
# Expected: number of directories with embeddings
```

---

## Files Modified

| File | Changes |
|------|---------|
| `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` | Stage 2 fixes: include qdrant_id, handle batch response shapes, vector literal format, use named vectors |

---

## Critical Decisions

1. **Summary first**: Summaries are prerequisites for embeddings (no circular dependencies)
2. **Named vectors**: Use Qdrant's vector namespace feature instead of payload bloat
3. **Offline latent**: Keep autoencoder separate (can be parallelized later)
4. **Postgres as truth**: pgvector is canonical; Qdrant is mirror/searchable copy

---

## Timeline Estimate

| Stage | Task | Time | Notes |
|-------|------|------|-------|
| 1 | Backfill summaries (58K chunks) | 30-60 min | 4 parallel GPU requests, depends on Gemma4 speed |
| 2 | Embed summaries (58K) | 15-30 min | Ollama is fast, can batch larger |
| 3 | Compute centroids | 5 min | CPU-only, ~300 directories |
| 4 | Warm cache | 2 min | Just writes to Redis |
| **Total** | All 4 stages | **52-97 min** | Parallelizable: do stages 1&2 concurrently after initial sanity |

---

## Next Session Actions

1. **Run Phase 1 sanity**: `--limit=20 --dry-run`
2. **Start Stage 1 backfill**: `--limit=2000 --apply` (repeat until complete)
3. **Monitor**: Check missing summary count between batches
4. **Progress**: Stage 2 can start once first batch of Stage 1 completes
5. **Parallelize**: Stages 3-4 can run once Stage 2 completes

---

*Checkpoint: 2026-06-24T08:30 UTC*  
*Stage 2 corrections applied*  
*Pipeline ready for execution*  
*Sanity check: 20-chunk test first, then production batches*
