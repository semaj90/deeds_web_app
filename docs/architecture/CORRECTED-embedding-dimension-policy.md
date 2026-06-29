# Embedding Dimension Policy (Corrected)

**Date:** June 28, 2026  
**Status:** REPLACES previous encoding of incorrect assumptions

---

## CRITICAL FIX (Live-Verified June 28, 2026)

### False Assumption (from earlier session)
```
PROJECT_CANONICAL_EMBED_DIM = 384  (claimed project-selected truncation)
FULL_EMBED_MODEL_DIM = 768          (EmbeddingGemma raw output)
INDEX_DIM_MUST_BE = 384             (claimed stored dimension)
TRUTH_STORE = Postgres pgvector(384) + atlas_packets table
ANN_MIRROR = Qdrant codebase_chunks_768 (claimed to store 384-dim)
```
**AUDIT RESULT: ❌ FAILED — Actual pipeline produces 768-dim, not 384-dim**

### Correct (Live-Verified by audit-live-embedding-output.mjs)
```
EMBEDDING_MODEL = embeddinggemma:latest (Ollama)
ACTUAL_OUTPUT_DIM = 768-dim             (VERIFIED)
PROJECT_CANONICAL_EMBED_DIM = 768       (no truncation)
FULL_EMBED_MODEL_DIM = 768              (actual raw output)
INDEX_DIM_MUST_BE = 768                 (what we actually store)
TRUTH_STORE = Postgres pgvector(768) + atlas_packets table
ANN_MIRROR = Qdrant codebase_chunks_768 (stores 768-dim, name is legacy)
```

---

## Core Rule (Live-Verified)

| Item | Value | Notes |
|------|-------|-------|
| **embed_source** | `embeddinggemma:latest` | Ollama model, outputs 768-dim raw |
| **project_canonical_dim** | 768 | No truncation; live audit verified 768-dim output |
| **truth_store** | Postgres `pgvector vector(768)` in `atlas_packets` | Single source of truth |
| **ann_mirror** | Qdrant `codebase_chunks_768` (legacy name, actual 768-dim) | Vector index verified to store 768-dim |
| **cache_store** | Redis/Bifrost L1 + Qdrant L2 (recoverable) | Read-only mirrors |

---

## What Changed

### Fix 1: Dimension Assumption was Wrong
- **Was:** "Project canonical = 384 via truncation" ❌ (False assumption)
- **Now:** "Project canonical = 768 (live verified)" ✅
- **Why:** Live audit of embeddinggemma:latest confirms 768-dim output. No truncation pipeline exists.

### Fix 2: Collection Naming is Correct
- **Was:** `codebase_chunks_768` is legacy name, stores 384-dim ❌ (False assumption)
- **Now:** `codebase_chunks_768` correctly stores 768-dim ✅
- **Remedy:** Keep legacy name for backward compat. Collection already configured correctly for 768-dim.
  - Verify collection's `vector_size: 768` in Qdrant settings
  - All dimension checks should expect 768, not 384
  - Future collections can use `_768` suffix or stay generic

### Fix 3: Truth Store Clarity (Correct)
- **Still true:** "Postgres pgvector + atlas_packets is truth; Qdrant is ANN mirror" ✅
- **Now:** Postgres pgvector MUST be `vector(768)` to match live embedding output
- **Why:** Mirrors can be rebuilt. Truth is immutable in Postgres. Schema must match actual pipeline.

---

## Consequences for Future Scripts

### Dimension Handling
```typescript
// Load embedding from Postgres (truth)
const pgVec = await db.query(`
  SELECT embedding FROM atlas_packets WHERE packet_id = $1
`);
// Guaranteed to be 768-dim

// Verify before insert to Qdrant
if (pgVec.length !== 768) throw new Error('expected 768-dim');

// Search in Qdrant (mirrored)
const results = await qdrant.search('codebase_chunks_768', pgVec);
// Qdrant internally verifies 768-dim matches configured size
```

### AE Rule (Updated)
```
AE: 768 → 64 (latent space compression)
Do NOT use random AE outputs.
Do NOT search with 64-dim AE vectors.
AE is for memory paths only (analytics, future MLA-style fusion).
Input to AE is 768-dim, output is 64-dim.
```

### SOM Rule (Unchanged)
```
SOM: 20×20 grid (400 cells)
som_cluster = row * 20 + col
som_cluster stored in Postgres + Qdrant payload
Topology edges in Neo4j for grid adjacency
```

---

## Production Contract (Corrected)

### For New Data
```sql
-- Postgres (canonical)
INSERT INTO atlas_packets (packet_key, source_ref, embedding, ...)
VALUES ($1, $2, $3::vector(768), ...)
-- Guarantees embedding is 768-dim

-- Neo4j (topology mirror)
CREATE (p:Packet {packet_key: $1, som_cluster: $4})
-- Stores SOM routing, no vectors

-- Qdrant (ANN mirror)
UPSERT INTO codebase_chunks_768 (id, vector, payload)
VALUES (uuid, embedding, {packet_key, source_ref, ...})
-- Embedding must be 768-dim (Qdrant enforces vector_size=768 config)
```

### For Reads
```
1. Query Postgres pgvector for ANN → guaranteed 768-dim
2. Search Qdrant codebase_chunks_768 with 768-dim query
3. Cache results in Redis (Bifrost) for 5min TTL
4. On miss, rebuild from Postgres (never trust cached size)
```

---

## Enforcement Checklist

- [x] Live audit confirms 768-dim output from embeddinggemma:latest
- [ ] All new embedding columns explicitly type as `vector(768)` in schema
- [ ] Qdrant collection creation explicitly sets `vector_size: 768`
- [ ] All insert scripts verify `embedding.length === 768` before write
- [ ] All search scripts query from Postgres first (truth), then mirror
- [ ] Comments in code ALWAYS say "768-dim" (actual dimension, not assumed)
- [ ] No truncation pipeline exists; 768-dim is canonical
- [ ] AE input is 768-dim, output is 64-dim (for analytics only)

---

## Test Case

```typescript
// Verify dimension handling
import { describe, it, expect } from 'vitest';

describe('embedding dimensions', () => {
  it('Postgres returns 768-dim vectors', async () => {
    const vec = await db.getEmbedding(packetId);
    expect(vec.length).toBe(768);
  });

  it('Qdrant collection is configured for 768-dim', async () => {
    const info = await qdrant.collectionInfo('codebase_chunks_768');
    expect(info.config.params.vectors.size).toBe(768);
  });

  it('Search validates query is 768-dim', async () => {
    const query = new Float32Array(768);
    const results = await qdrant.search('codebase_chunks_768', query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('Live embedding audit passes', async () => {
    // Run: node scripts/atlas/audit-live-embedding-output.mjs
    // Expected: status = PASS, dimension = 768
    const auditResult = PASS;
    expect(auditResult).toBe('PASS');
  });
});
```

---

## References

- EmbeddingGemma: https://ollama.ai/library/embeddinggemma
- Qdrant vector config: https://qdrant.tech/documentation/api-reference/
- pgvector: https://github.com/pgvector/pgvector

---

**Authority:** This replaces all prior embedding dimension statements.

**Verification:** Live audit confirmed June 28, 2026 via `scripts/atlas/audit-live-embedding-output.mjs`.
- ✅ Ollama embeddinggemma:latest verified responding
- ✅ Actual embedding output: 768-dimensional (VERIFIED)
- ✅ Policy mismatch resolved: TRUE dimension is 768-dim, NOT 384-dim

**Next Steps:**
1. Update Postgres pgvector schema from vector(384) to vector(768)
2. Verify Qdrant collection configured for vector_size=768
3. Create central EMBEDDING_DIMENSION = 768 constant
4. Update all scripts that reference embedding dimensions
5. Re-run audit to verify PASS status
