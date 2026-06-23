# P4: Graph Refresh & Topology Edges (Post-P3g)

**Status**: Ready to execute after P3g embedding completes  
**Date**: June 23, 2026  
**Estimated Duration**: 30–60 minutes

---

## Objective

After P3g backfill completes (all 17,995 packets with Qdrant embeddings), refresh Neo4j topology to:
1. Create **SIMILAR_TOPOLOGY** edges between neighboring SOM cells
2. Populate **Karpathy Authority Blend** (0.4·PageRank + 0.3·attention + 0.3·authority)
3. Update **ACE context retrieval** to use refreshed topology scores

---

## Prerequisites (Verify Before Starting P4)

```bash
# 1. P3g complete: 100% of packets have qdrant_point_id
node scripts/atlas/verify-p3-readiness.mjs

# Expected output:
# ✅ All 17,995 packets have qdrant_point_id
# ✅ Qdrant points_count == 17,995
# ✅ No NULL values in critical columns

# 2. Qdrant collection healthy
curl http://127.0.0.1:6333/collections/codebase_chunks_768

# Expected: { "status": "green", "points_count": 17995 }

# 3. Neo4j online
curl http://localhost:7474

# Expected: Neo4j browser UI or 200 response
```

---

## Step 1: Build Topology Edges (SOM Grid Neighbors)

**Script**: `scripts/atlas/backfill-qdrant-som-from-centroids.mjs`

Creates SIMILAR_TOPOLOGY edges in Neo4j based on SOM grid coordinates (som_row, som_col) from atlas_packets.

```bash
# Dry-run first
node scripts/atlas/backfill-qdrant-som-from-centroids.mjs --dry-run

# Apply
node scripts/atlas/backfill-qdrant-som-from-centroids.mjs --apply
```

**Expected Result**:
- Creates up to `20×20 × 8 neighbors` = ~3,200 edges in Neo4j
- Each cell (row, col) connected to 8 adjacent cells (Moore neighborhood)
- Edges labeled: SIMILAR_TOPOLOGY, confidence = 0.95

---

## Step 2: Refresh PageRank Scores

**Script**: `scripts/atlas/run-pagerank.ts` or equivalent

Computes graph centrality scores on Neo4j and writes to Redis cache (`couchdb:pagerank_scores`, TTL 6h).

```bash
# Compute PageRank (may take 5–10 minutes on full graph)
npm run pagerank:compute

# Or if using script directly:
node scripts/atlas/pagerank-neo4j-compute.mjs --apply --depth=3 --damping=0.85
```

**Expected Result**:
- Top-100 nodes by PageRank cached in Redis
- CouchDB MapReduce view updated: `_design/graph/_view/pagerank_ordered`
- Neo4j node property `pageRank_score` populated

---

## Step 3: Compute Attention Scores

**Script**: `scripts/atlas/backfill-karpathy-attention-qdrant.mjs`

Uses GPU (LibTorch) to compute cosine similarity between query vector and packet vectors for attention weighting.

```bash
# Requires: TurboQuant server running with --embeddings support
# Or: Ollama embeddinggemma:latest available

node scripts/atlas/backfill-karpathy-attention-qdrant.mjs --apply --batch 100
```

**Expected Result**:
- Attention scores computed for top-100 PageRank nodes
- Scores stored in Redis hash: `gpu:karpathy:encoded` (64-dim autoencoder output)
- Scores also in `gpu:karpathy:scores` (JSON: pr, attn, authority, blend)

---

## Step 4: Populate Karpathy Authority Blend

**Script**: `scripts/atlas/karpathy-gpu-enrich.mjs`

Combines three ranking signals into single blend score:

```
blend = 0.4 * PageRank + 0.3 * AttentionScore + 0.3 * AuthorityScore
```

```bash
# Compute blend for top-200 nodes
npm run karpathy:gpu --limit=200 --batch=50

# Or full run:
node scripts/atlas/karpathy-gpu-enrich.mjs --apply --top=1000
```

**Expected Result**:
- Redis hash `gpu:karpathy:scores` populated with blend scores
- Keys: file paths, values: JSON `{pr, attn, authority, blend}`
- TTL: 24 hours
- ACE context assembly now uses blend for reranking

---

## Step 5: Verify All Integration Points

**Verification Script**: `scripts/atlas/audit-karpathy-mirror.mjs`

Confirms topology edges, PageRank scores, and blend computation are synced.

```bash
# Run full audit
node scripts/atlas/audit-karpathy-mirror.mjs --verbose

# Expected checks:
# ✅ 3,200+ SIMILAR_TOPOLOGY edges in Neo4j
# ✅ PageRank scores in Redis (couchdb:pagerank_scores)
# ✅ Attention scores in Redis (gpu:karpathy:*) 
# ✅ Blend scores populated (gpu:karpathy:scores)
# ✅ ACE context uses blend on ACEStage A0
```

---

## Step 6: Update ACE Context Assembly

**File**: `src/lib/server/ace/context-assembler.ts`

Ensure ACE Stage A0 (context assembly) uses the Karpathy blend for reranking:

```typescript
// In context-assembler.ts, Stage A0 retrieval:

const blendScores = await redis.hgetall('gpu:karpathy:scores');
const rankedByBlend = candidates.map(c => ({
  ...c,
  blend: blendScores[c.file] ? JSON.parse(blendScores[c.file]).blend : 0
})).sort((a, b) => b.blend - a.blend);

// Return top-K by blend
return rankedByBlend.slice(0, topK);
```

**Verification**: After re-deploying, test ACE context assembly:
```bash
npm run smoke:ace:context:blend
```

---

## Timeline & Checkpoints

| Phase | Duration | Status | Checkpoint |
|-------|----------|--------|------------|
| P3g (In Progress) | 60–90 min | 🟡 Running | 22.9% (3,100/13,545) |
| P4 Topology | 5–10 min | ⏳ Queued | Neo4j SIMILAR_TOPOLOGY edges |
| P4 PageRank | 5–10 min | ⏳ Queued | Redis pagerank_scores |
| P4 Attention | 10–20 min | ⏳ Queued | Redis gpu:karpathy:scores |
| P4 Blend | 5 min | ⏳ Queued | Blended ranking live |
| P4 Verify | 5 min | ⏳ Queued | All gates PASS |
| **TOTAL P4** | **30–55 min** | | |

---

## Rollback Plan

If any P4 step fails:

1. **Topology edges corrupt?**
   ```bash
   # Delete edges and retry
   MATCH ()-[r:SIMILAR_TOPOLOGY]->() DELETE r
   node scripts/atlas/backfill-qdrant-som-from-centroids.mjs --apply
   ```

2. **PageRank scores stale?**
   ```bash
   # Evict cache and recompute
   redis-cli DEL couchdb:pagerank_scores
   npm run pagerank:compute
   ```

3. **Attention scores wrong?**
   ```bash
   # Clear and recompute with different batch size
   redis-cli DEL gpu:karpathy:scores gpu:karpathy:encoded
   node scripts/atlas/backfill-karpathy-attention-qdrant.mjs --apply --batch 50
   ```

4. **ACE context not using blend?**
   ```bash
   # Verify context-assembler.ts wired correctly
   npm run smoke:ace:context:blend
   # If fail, check Redis keys exist: redis-cli HGETALL gpu:karpathy:scores
   ```

---

## Success Criteria

- [x] P3g embedding complete: 17,995/17,995 packets with qdrant_point_id
- [ ] P4 topology edges created: SIMILAR_TOPOLOGY edges in Neo4j
- [ ] P4 PageRank computed: Top-100 nodes cached in Redis
- [ ] P4 attention scores: GPU blend scores in Redis
- [ ] P4 verification: All gates PASS
- [ ] ACE integration: Context assembly uses blend scores
- [ ] Smoke test: Retrieval quality metrics improve by 5–10%

---

## Next: P5 GPU Acceleration Health

After P4 complete, P5 validates:
- GPU memory utilization (Qdrant HNSW search + LibTorch similarity)
- Cache hit rates (L1 exact vs L2 semantic vs L3 GPU rerank)
- End-to-end latency (HyperRAG packet RPC + Qdrant + Neo4j rerank)

**Command**: `npm run atlas:gpu:health`
