# Embedding Dimension Consolidation: 768 vs 384 vs MRL

**Date**: July 20, 2026  
**Status**: AUDIT COMPLETE — Recommend consolidation to canonical 768-dim native lane

---

## Current State

| Lane | Column | Dim | Source | Status | Proven |
|------|--------|-----|--------|--------|--------|
| **Native** | `content_embedding` | 768 | EmbeddingGemma native output | ✅ Operational | ✅ YES — official model output |
| **384-dim Truncation** | `content_embedding_384` | 384 | Ollama `/api/embed?dimensions=384&truncate=true` | ✅ Operational | ❌ NO — undocumented, unproven |

---

## The Problem

### EmbeddingGemma Matryoshka Regression Loss (MRL) Official Sizes

According to the model card and documentation, EmbeddingGemma supports the following **official Matryoshka dimensions**:

- **768** (native, full model)
- **512** (documented, proven)
- **256** (documented, proven)
- **128** (documented, proven)

**384 is NOT in this list.** It requires:
1. Truncation to 384 dimensions
2. Re-normalization (L2 norm to unit vector)
3. Validation that truncation preserves semantic structure

### Your 384-dim Lane

The backfill script requests Ollama to truncate via `dimensions: 384` + `truncate: true`. This assumes:
- Ollama implements correct truncation (no evidence)
- Re-normalization is applied (no evidence)
- Semantic quality is preserved (untested)

**No validation gates exist** for this choice.

---

## Recommended Architecture

### Tier 1: Canonical Native (768-dim L2-normalized)

```typescript
// embedding-client.ts or onnx-embed.ts
const canonicalEmbedding = async (text: string) => {
  const emb = await ollama.embed({
    model: 'embeddinggemma:latest',
    prompt: text,
    // NO dimensions parameter — use native 768-dim
  });
  // Validate 768-dim, ensure L2-normalized
  return emb; // 768-dim vector
};

// Storage
codebase_chunk_index.content_embedding → halfvec (768-dim, 2 bytes/val)
```

**Why**: Official model output, proven quality, no truncation artifacts.

### Tier 2: Compact Retrieval (256-dim MRL, optional)

```typescript
// Only if retrieval latency or storage becomes critical
const compactEmbedding = async (text: string) => {
  const emb = await ollama.embed({
    model: 'embeddinggemma:latest',
    prompt: text,
    dimensions: 256, // Official MRL size
  });
  // Validate 256-dim, ensure L2-normalized
  // Validate recall@10, NDCG@10, MRR vs 768-dim baseline
  return emb;
};

// Storage
codebase_chunk_index.content_embedding_256 → halfvec (optional, experimental)
```

**When to add**: Post-Phase 106, after proving 768-dim retrieval quality. Only if:
- Recall@10 loss < 5%
- Storage reduction justifies complexity
- Latency improvement > 20%

### Tier 3: Latent/Routing (64-dim autoencoder, visualization only)

```typescript
// Separate offline lane, NOT for retrieval
const latentEmbedding = async (embedding768: Float32Array) => {
  const latent64 = await autoencoder.encode(embedding768);
  // SOM clustering, graph visualization, routing decisions ONLY
  return latent64; // 64-dim
};

// Storage
codebase_chunk_index.latent_embedding_64 → halfvec (optional, for clustering)
```

**Purpose**: SOM topology, graph clustering, visualization. NEVER use as retrieval vector.

---

## Action Items

### Immediate (Phase 106 Stage 4)

✅ **Keep 768-dim native lane operational**
- Canonical retrieval vector
- All 5-tier cascade tiers produce 768-dim or fail gracefully
- No changes needed

❌ **Deprecate 384-dim lane**
- No documented justification
- Unproven truncation
- Zero validation gates
- Recommend: Archive or delete after Phase 106

### Post-Phase 106 (Phase 107)

If retrieval performance or storage becomes critical:

1. **Evaluate 256-dim MRL**
   - Embed reference corpus with `dimensions: 256`
   - Run offline evaluation: Recall@10, NDCG@10, MRR
   - Compare vs 768-dim baseline
   - Decision: accept / reject based on metrics

2. **Optionally train autoencoder (64-dim latent)**
   - Separate from retrieval lane
   - Use only for clustering, topology, visualization
   - Requires training and validation

---

## Schema Consolidation Plan

### Phase 106 (Now)

No schema changes. Keep all columns:
- `content_embedding` (768-dim halfvec) — CANONICAL
- `content_embedding_384` (384-dim vector) — Mark as deprecated in code comments

### Phase 107+ (Post-Phase 106)

Option A: Archive 384-dim lane
```sql
-- Stop backfilling content_embedding_384
-- Mark column as deprecated: UPDATE atlas_packets SET content_embedding_384 = NULL WHERE ...
-- Delete after 90-day retention
ALTER TABLE codebase_chunk_index DROP COLUMN content_embedding_384; -- future
```

Option B: Introduce 256-dim MRL (only if validation passes)
```sql
ALTER TABLE codebase_chunk_index ADD COLUMN content_embedding_256 halfvec;
CREATE INDEX idx_content_embedding_256_ivfflat ON codebase_chunk_index USING ivfflat (content_embedding_256);
```

Option C: Add latent routing vector (clustering only)
```sql
ALTER TABLE codebase_chunk_index ADD COLUMN latent_embedding_64 halfvec;
-- Index for SOM clustering, not for similarity search
```

---

## Recommendation for Phase 106

✅ **Proceed with 768-dim canonical lane only**
- Remove all references to `content_embedding_384` from embedding-client.ts
- Revert backfill-embedding-lane.mjs to use native 768-dim (remove `dimensions: 384` parameter)
- Update P1 ONNX fallback to validate 768-dim L2-normalized (already correct)
- Document: "EmbeddingGemma canonical dimension is 768. MRL reduction to 256 is optional post-Phase 106."

**Rationale**:
- 384-dim truncation is untested and unsupported
- 768-dim native is proven, stable, official
- Phase 106 success doesn't depend on 384-dim
- Optional optimizations can be added later with proper validation

---

## Confidence Level

| Area | Confidence | Note |
|------|-----------|------|
| 768-dim is canonical | 🟢 HIGH (99%) | Official model output |
| 384-dim truncation is questionable | 🔴 LOW (20%) | No validation, no justification |
| 256-dim MRL is reliable fallback | 🟡 MEDIUM (70%) | Official, but untested in this codebase |
| Phase 106 can succeed with 768-dim only | 🟢 HIGH (95%) | All infrastructure wired for 768-dim |

---

## References

- EmbeddingGemma model card: https://huggingface.co/google/embedding-gemma
- Matryoshka embeddings: https://arxiv.org/abs/2205.13147
- Ollama embeddings API: https://github.com/ollama/ollama/blob/main/docs/api.md#embeddings

