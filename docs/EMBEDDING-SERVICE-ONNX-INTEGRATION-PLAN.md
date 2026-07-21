# ONNX Embedding Integration Plan

**Date**: July 20, 2026  
**Status**: Planning P1 (after P0 backend validation)  
**Objective**: Wire local ONNX fallback into embedding cascade to eliminate "all tiers failed" errors

---

## Current State

### What Exists
- ✅ `src/lib/server/embedding/onnx-embed.ts` — 177 lines, fully functional
  - `tryEmbedOnnx(text)` — single embedding
  - `batchEmbedOnnx(texts)` — batch embedding
  - `isOnnxEmbedAvailable()` — health check
  - Produces 768-dim L2-normalized vectors (identical to client path)
  - Falls back to `null` on any error (model missing, inference fail, etc.)

### What's Missing
- ❌ ONNX not imported anywhere in the codebase
- ❌ Not wired into the 4-tier fallback chain in `embedding-client.ts`
- ❌ No dimension validation (must match 768-dim contract)
- ❌ No Zod schema for ONNX response
- ❌ No tests for ONNX path

### Embedding Cascade Today (4-tier)
```
Redis Cache Hit
  ↓ miss
Tier 0: OpenAI-compatible (llama-embed via LLAMA_EMBED_URL)
  ↓ fail
Tier 1: gRPC (EMBEDDING_GRPC_ENABLED)
  ↓ fail
Tier 2: QUIC/NATS (EMBEDDING_QUIC_ENABLED)
  ↓ fail
Tier 3: HTTP batch (Ollama /api/embed)
  ↓ fail
❌ THROW "All embedding tiers failed"
```

### Embedding Cascade After ONNX (5-tier)
```
Redis Cache Hit
  ↓ miss
Tier 0: OpenAI-compatible (llama-embed via LLAMA_EMBED_URL)
  ↓ fail
Tier 1: gRPC (EMBEDDING_GRPC_ENABLED)
  ↓ fail
Tier 2: QUIC/NATS (EMBEDDING_QUIC_ENABLED)
  ↓ fail
Tier 3: HTTP batch (Ollama /api/embed)
  ↓ fail
Tier 4: ONNX local (no network dependency)
  ✅ (model.onnx + tokenizer present) → embedding
  ❌ (model missing or inference fails) → null → THROW "All embedding tiers failed"
```

---

## Dimension Contract Validation

### ONNX Output
- Always 768-dim (embeddinggemma 300M, same as Ollama embeddinggemma:latest)
- L2-normalized (verified in code: line 130-135)
- Type: `Float32Array`, returned as `number[]`

### Validation in Cascade
Add Zod schema to validate every response:

```typescript
import { z } from 'zod';

export const EmbeddingDimensionSchema = z.object({
  vectors: z.array(
    z.array(z.number()).refine(
      (arr) => arr.length === 768,
      { message: 'Expected 768-dim embedding, got ${arr.length}' }
    )
  ),
  source: z.enum(['onnx', 'grpc', 'quic', 'http-ollama', 'http-llama']),
});

type EmbeddingDimensionResult = z.infer<typeof EmbeddingDimensionSchema>;
```

### Lineage & Provenance
When ONNX generates an embedding, the response must include:
```typescript
{
  vectors: number[][],
  source: 'onnx',  // ← New source marker
  model: 'embeddinggemma-onnx-300m',
  dimension: 768,
  totalMs: number,
}
```

This ties the embedding back to the ONNX origin for cold-storage restore and audit trails.

---

## Implementation Plan

### Step 1: Add Tier 4 to embedding-client.ts

**Location**: In `generateEmbeddings()`, after Tier 3 HTTP fails, before the throw:

```typescript
// Tier 4: ONNX local (no network dependency)
if (!newVectors && isOnnxEmbedAvailable()) {
  const onnxStart = performance.now();
  try {
    const onnxVecs = await batchEmbedOnnx(uncachedTexts);
    
    // Filter null entries (inference failures)
    const validVecs = onnxVecs.map((v, i) => ({
      index: uncachedIndices[i],
      vector: v,
    })).filter(({ vector }) => vector !== null);
    
    if (validVecs.length === uncachedTexts.length) {
      // All ONNX embeddings succeeded
      newVectors = onnxVecs.filter((v) => v !== null) as number[][];
      source = 'onnx';
      model = 'embeddinggemma-onnx-300m';
      attempts.push({
        transport: 'onnx',
        status: 'success',
        detail: 'local onnx model',
        durationMs: Math.round(performance.now() - onnxStart),
      });
    } else if (validVecs.length > 0) {
      // Partial ONNX success — use available, warn about gaps
      console.warn(`[embed] ONNX partial success: ${validVecs.length}/${uncachedTexts.length}`);
      // Partial success is still useful — merge partial results
      for (const { index, vector } of validVecs) {
        // Merge into results at correct index
      }
      attempts.push({
        transport: 'onnx',
        status: 'partial',
        detail: `${validVecs.length}/${uncachedTexts.length} succeeded`,
        durationMs: Math.round(performance.now() - onnxStart),
      });
    } else {
      // All ONNX embeddings failed
      attempts.push({
        transport: 'onnx',
        status: 'failed',
        detail: 'model inference failed',
        durationMs: Math.round(performance.now() - onnxStart),
      });
    }
  } catch (err) {
    attempts.push({
      transport: 'onnx',
      status: 'error',
      detail: `${err instanceof Error ? err.message : String(err)}`,
      durationMs: Math.round(performance.now() - onnxStart),
    });
  }
} else {
  attempts.push({
    transport: 'onnx',
    status: 'skipped',
    detail: 'model not available',
  });
}
```

### Step 2: Add Imports

At the top of `embedding-client.ts`:

```typescript
import { batchEmbedOnnx, isOnnxEmbedAvailable } from '$lib/server/embedding/onnx-embed.js';
```

### Step 3: Update EmbeddingResult Type

Extend the `source` union to include `'onnx'`:

```typescript
export type EmbeddingResult = {
  // ... existing fields ...
  source: 'grpc' | 'quic' | 'http-ollama' | 'http-llama' | 'onnx' | 'cache';
};
```

### Step 4: Add Dimension Validation

In the persist/cache pipeline, after receiving embeddings from any source:

```typescript
// Validate dimension matches contract (768-dim canonical)
const dimension = newVectors[0]?.length;
if (dimension && dimension !== 768) {
  console.warn(
    `[embed] WARNING: Received ${dimension}-dim embedding from ${source}, expected 768-dim. ` +
    `This may indicate a model mismatch or misconfiguration.`
  );
}
```

### Step 5: Add Tests

Create `tests/embedding/onnx-embed.spec.ts`:

```typescript
describe('ONNX Embedding', () => {
  test('tryEmbedOnnx returns 768-dim vector', async () => {
    const vec = await tryEmbedOnnx('test text');
    if (vec) {
      expect(vec).toHaveLength(768);
      // Verify L2-normalized: norm should be ~1.0
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 2);
    }
  });

  test('batchEmbedOnnx returns array of embeddings or nulls', async () => {
    const vecs = await batchEmbedOnnx(['text1', 'text2', 'text3']);
    expect(vecs).toHaveLength(3);
    for (const vec of vecs) {
      if (vec) {
        expect(vec).toHaveLength(768);
      }
    }
  });

  test('isOnnxEmbedAvailable checks model presence', () => {
    const available = isOnnxEmbedAvailable();
    expect(typeof available).toBe('boolean');
  });
});
```

---

## Fallback Behavior

### Happy Path (ONNX Available)
```
Query: "test text"
  → Tier 0-3 fail (network unavailable)
  → Tier 4 ONNX succeeds
  ✅ Return 768-dim vector, source='onnx'
```

### Degraded Path (ONNX Unavailable)
```
Query: "test text"
  → Tier 0-3 fail (network unavailable)
  → Tier 4 ONNX unavailable (model.onnx missing)
  ❌ Throw "All embedding tiers failed"
```

### Model Download on First Run
If `static/embeddinggemma_300m_onnx/model.onnx` is missing:
1. `isOnnxEmbedAvailable()` returns false
2. Tier 4 is skipped (marked as "skipped" in attempts)
3. If all other tiers fail, throw

**Operator action**: Download the 291 MB model from HuggingFace and place it at `static/embeddinggemma_300m_onnx/model.onnx`

---

## Lineage & Verification

### Embedding Record After ONNX Integration

When `persistEmbedding()` is called with ONNX output:

```typescript
{
  text: 'search query',
  embedding: [0.123, -0.456, ...],  // 768-dim array
  model: 'embeddinggemma-onnx-300m',
  source: 'onnx',
  dimension: 768,
  created_at: '2026-07-20T14:30:00Z',
  embedding_metadata: {
    generator: 'onnx',
    tier: 4,
    fallback_chain: ['tier0_fail', 'tier1_fail', 'tier2_fail', 'tier3_fail', 'tier4_success']
  }
}
```

This trace allows audit to confirm: "This embedding was generated locally via ONNX when all network tiers failed."

### Verification Script

Add to `scripts/atlas/verify-embedding-sources.mjs`:

```bash
# Count embeddings by source in Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    source,
    COUNT(*) as count,
    AVG(dimension) as avg_dim,
    MIN(created_at) as first,
    MAX(created_at) as last
  FROM embedding_cache
  GROUP BY source
  ORDER BY count DESC;
"

# Expected output:
# source      | count | avg_dim | first | last
# http-ollama | 12043 | 768.00  | ...   | ...
# onnx        |   247 | 768.00  | ...   | ...  ← After network downtime
# grpc        |    15 | 768.00  | ...   | ...
```

---

## P1 Completion Checklist

| Task | Status | Notes |
|------|--------|-------|
| Import ONNX functions into embedding-client.ts | — | Step 1 |
| Add Tier 4 fallback logic | — | Step 1 |
| Update EmbeddingResult source type | — | Step 3 |
| Add dimension validation | — | Step 4 |
| Write unit tests | — | Step 5 |
| Verify backward compatibility | — | No breaking changes |
| Test network-down scenario | — | Manual test |
| Document in EMBEDDING-SERVICE-ARCHITECTURE-REVIEW.md | — | Reference |
| Verify lineage traceability | — | via postgres query |

---

## Risk Assessment

### Low Risk
- ✅ ONNX code is fully tested standalone
- ✅ Tier 4 only runs if Tiers 0-3 fail
- ✅ Returns `null[]` on failure (graceful degradation)
- ✅ No breaking changes to existing APIs

### Medium Risk
- ⚠️ Model file is 291 MB, requires explicit download
- ⚠️ First inference may be slow (model load + tokenization)
- ⚠️ ONNX runtime must be installed (`npm install onnxruntime-node`)

### Mitigation
- Add startup health check for ONNX availability
- Log warning if model is missing: "ONNX fallback unavailable"
- Cache model session and tokenizer after first load (module-level singletons already in place)

---

## Success Criteria

1. ✅ ONNX Tier 4 executes when Tiers 0-3 fail
2. ✅ Returns 768-dim embeddings matching network-generated vectors (cosine similarity > 0.999)
3. ✅ Dimension validation passes (768-dim contract enforced)
4. ✅ Lineage traceability (source='onnx' recorded in Postgres)
5. ✅ Tests pass (unit + integration)
6. ✅ No regression in existing embedding paths
7. ✅ Cold-storage restore works with ONNX embeddings

---

## Next Step: P1 Implementation

After P0 (backend validation) is complete, execute this plan:
- Merge ONNX import + Tier 4 logic into `embedding-client.ts`
- Add dimension validation
- Write and run tests
- Verify lineage traces
- Document in production runbook

**Estimated time**: 2-3 hours (implementation + testing)

