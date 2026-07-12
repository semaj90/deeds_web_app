# Vector Dimension Canonical Reference

**Status**: ✅ **AUTHORITATIVE** — July 11, 2026  
**Supersedes**: All prior dimension documentation  
**Authority**: `src/lib/server/vector/vector-contracts.ts`  

---

## Canonical Vector Spaces (Immutable)

Three complete, independent vector representations per Qdrant point:

| Space | Dimension | Distance Metric | Use Case | Score Threshold | Model |
|-------|-----------|-----------------|----------|-----------------|-------|
| **semantic_embedding** | 384-dim | Cosine | Canonical content similarity | 0.3 | embeddinggemma:latest (truncated) |
| **topology_embedding** | 128-dim | Cosine | Structural relationships (imports, belongs-to, type hierarchy) | 0.5 | deterministic projection from semantic |
| **latent_embedding** | 64-dim | Cosine | Routing, clustering, cache selection | 0.4 | autoencoder compression (768→64) |

**Key Contract**: Each vector is a **complete independent representation** of the same point. NOT token-level multivectors (ColBERT-style). Each vector is searched independently via `vectorName` parameter.

---

## Dimension Validation (Non-Negotiable)

**Hard stop if mismatched**:

```typescript
// Enforced at compile time (type system) + runtime (assertVectorDimension)
if (vector.length !== VECTOR_DIMENSIONS[vectorName]) {
  throw new Error(
    `Vector dimension mismatch for ${vectorName}: ` +
    `expected ${VECTOR_DIMENSIONS[vectorName]}, received ${vector.length}. ` +
    `Ensure embedding model output matches the named vector schema.`
  );
}
```

**No silent degradation**: A 256-dim vector will NOT be padded or truncated. It will be rejected before Qdrant call.

**No coercion**: A 768-dim vector passed to `semantic_embedding` (384-dim) will NOT be automatically downsampled. It will warn in Phase 8.6, error in Phase 9+.

---

## Phase-Specific Dimensions

### Phase 8.6 (Current: Legacy Compatibility)
- **Active collections**: `codebase_chunks_768` (768-dim, unnamed vector, legacy)
- **Reranker uses**: 768-dim from Ollama `embeddinggemma:latest`
- **Qdrant search**: Direct 768-dim cosine search
- **Contract status**: Dimension mismatch → warned, allowed through (non-breaking)

### Phase 9 (Migration)
- **New collections**: `codebase_chunks_named` (multi-vector named vectors)
  - `content`: 384-dim (semantic_embedding)
  - `structure`: 128-dim (topology_embedding)
  - `routing`: 64-dim (latent_embedding)
- **Reranker migrates**: 768-dim → truncated 384-dim or full three-vector blend
- **Contract status**: Dimension mismatch → error, no fallback

### Phase 10+ (Mature)
- **All collections**: Named vectors only (768-dim legacy removed)
- **No legacy warnings**: Cleaner logs
- **Multi-vector strategies**: Blend three vector spaces per query

---

## Embedding Model Outputs (Authoritative)

| Model | Output Dimension | Used By | Notes |
|-------|------------------|---------|-------|
| `embeddinggemma:latest` (Ollama) | 768 | Phase 8.6 reranker | Native output, no truncation |
| `embeddinggemma:latest` (truncated to 384) | 384 | Phase 9 semantic_embedding | Trim last 384 values |
| `topology_embedding` (deterministic) | 128 | Structural lane | Computed from semantic, not learned |
| `latent_embedding` (autoencoder) | 64 | Routing lane | Trained 768→64 compression |

**Rule**: Do NOT instantiate new embedding dimensions without updating this table and `VECTOR_DIMENSIONS` in `vector-contracts.ts`.

---

## Qdrant Payload Schema (Per Vector Space)

### semantic_embedding (384-dim)
```json
{
  "id": "uuid",
  "vector": { "name": "semantic_embedding", "vector": [0.1, 0.2, ...] },
  "payload": {
    "source_ref": "src/lib/server/auth.ts",
    "file_path": "src/lib/server/auth.ts",
    "feature_id": "auth.sessions",
    "feature_label": "Authentication Sessions",
    "kind": "function",
    "language": "typescript",
    "content": "Session validation logic...",
    "content_preview": "Handles Lucia session...",
    "cluster_id": "cluster-42",
    "workspace_id": "workspace-123"
  }
}
```

### topology_embedding (128-dim)
```json
{
  "id": "uuid",
  "vector": { "name": "topology_embedding", "vector": [0.01, 0.02, ...] },
  "payload": {
    "source_ref": "src/lib/server/auth.ts",
    "topology_class": "services.auth",
    "imports": ["src/lib/db/client.ts", "src/lib/types/user.ts"],
    "imported_by": ["src/routes/api/auth/+server.ts"],
    "similarity_neighbors": ["src/lib/server/sessions.ts"]
  }
}
```

### latent_embedding (64-dim)
```json
{
  "id": "uuid",
  "vector": { "name": "latent_embedding", "vector": [0.001, 0.002, ...] },
  "payload": {
    "source_ref": "src/lib/server/auth.ts",
    "routing_cluster": "cluster-7",
    "cache_hint": "hot",
    "ae_reconstruction_loss": 0.0015
  }
}
```

---

## Distance Metrics (Qdrant Requirement)

All three vector spaces use **Cosine distance**:

```
cosine_similarity(u, v) = dot(u, v) / (||u|| * ||v||)
score = (similarity + 1) / 2  # Map [-1, 1] → [0, 1]
```

**Why Cosine?**
- Invariant to vector magnitude (matters for compressed 64-dim vs 384-dim)
- Symmetric (query→candidate == candidate→query)
- Efficient HNSW index support

**Not Euclidean or DotProduct**:
- Euclidean scales poorly with dimension (384-dim distances are inherently large)
- DotProduct requires normalized vectors (we normalize separately if needed)

---

## Validation Pipeline

**Before ANY Qdrant call**:

```
1. Input: DenseSearchParams { queryVector, vectorName, ... }
2. assertVectorDimension(vectorName, queryVector)
   a. Check vector.length === VECTOR_DIMENSIONS[vectorName]
   b. Check all values satisfy Number.isFinite()
   c. If not: throw with detailed error message
3. buildQdrantSearchRequest(params)
   a. Construct { name: vectorName, vector: queryVector }
   b. Apply distance metric: Cosine
   c. Apply score_threshold from VECTOR_STRATEGIES[vectorName]
4. qdrant.search(collection, request) → results
```

**No fallback**: If validation fails, the error propagates immediately. No retry, no dimension coercion, no silent degradation.

---

## Common Mistakes (Anti-Patterns)

### ❌ Mixing vector dimensions in same request
```typescript
// WRONG: Trying to search all three dimensions at once
const results = await qdrant.search(collection, {
  vector: { name: 'semantic_embedding', vector: queryVec768 },
  ...
});
// Error: queryVec768 is 768-dim but semantic_embedding is 384-dim
```

**Fix**: Search each dimension separately, then blend results via RRF.

### ❌ Assuming vectors are interchangeable
```typescript
// WRONG: Using latent_embedding (64-dim) in place of semantic_embedding (384-dim)
const results = await qdrant.search(collection, {
  vector: { name: 'semantic_embedding', vector: latent64DimVec },
  ...
});
// Error: dimension mismatch
```

**Fix**: Use the correct vector space for the use case (routing vs content similarity).

### ❌ Padding/truncating vectors dynamically
```typescript
// WRONG: Trying to "fix" a 256-dim vector by padding or truncating
const fixedVec = vec256.length < 384 
  ? [...vec256, ...Array(384 - vec256.length).fill(0)]
  : vec256.slice(0, 384);
// Result: Invalid semantic meaning, poor search quality
```

**Fix**: Use the correct embedding model that produces 384-dim output.

### ❌ Ignoring NaN/Infinity values
```typescript
// WRONG: Vector contains NaN (e.g., from division by zero)
const vec = embedding.map(x => x / Math.sqrt(similarity)); // May produce NaN
// Qdrant accepts it but searches fail silently
```

**Fix**: assertVectorDimension() checks for finite values — will catch this.

---

## Migration Checklist (Phase 8.6 → Phase 9)

- [ ] All Qdrant collections migrated to named vectors (384/128/64-dim)
- [ ] Reranker updated to use 384-dim semantic_embedding (or full blend)
- [ ] Dimension warnings removed from validation (only errors remain)
- [ ] All callers passing correct vectorName per use case
- [ ] Topology lane activated (128-dim structural searches)
- [ ] Latent lane activated (64-dim routing/cache selection)
- [ ] Test suite covers all three vector spaces
- [ ] Monitoring alerts on dimension validation errors (should be zero)

---

## Qdrant Collection Configuration (Terraform/Terraform)

```yaml
codebase_chunks_named:
  vectors:
    semantic_embedding:
      size: 384
      distance: Cosine
    topology_embedding:
      size: 128
      distance: Cosine
    latent_embedding:
      size: 64
      distance: Cosine
  quantization_config:
    scalar: int8
  hnsw_config:
    m: 16
    ef_construct: 64
    ef_search: 128
```

---

## Testing Vectors (For Unit Tests)

```typescript
// Valid semantic_embedding (384-dim)
const semantic384 = new Float32Array(384).fill(0.1);

// Valid topology_embedding (128-dim)
const topology128 = new Float32Array(128).fill(0.1);

// Valid latent_embedding (64-dim)
const latent64 = new Float32Array(64).fill(0.1);

// Invalid: wrong dimension for semantic_embedding
const wrong768 = new Float32Array(768).fill(0.1);  // ← Will fail validation

// Invalid: contains NaN
const withNaN = new Float32Array([0.1, NaN, 0.1]);  // ← Will fail validation

// Invalid: contains Infinity
const withInfinity = new Float32Array([0.1, Infinity, 0.1]);  // ← Will fail validation
```

---

## Troubleshooting

**Symptom**: `Vector dimension mismatch for semantic_embedding: expected 384, received 768`

**Cause**: Calling reranker with 768-dim embedding in Phase 9+ (after migration).

**Fix**: Truncate or re-embed with correct model:
```typescript
// Option 1: Truncate (lossy, not recommended)
const truncated384 = full768.slice(0, 384);

// Option 2: Re-embed with correct model (recommended)
const correct384 = await embedText(text);  // Uses embeddinggemma correctly
```

**Symptom**: `Vector contains non-finite value at index 42 for semantic_embedding: NaN`

**Cause**: Embedding model produced NaN (division by zero, underflow, etc.).

**Fix**: Debug the embedding pipeline:
```typescript
const result = await ollama.embeddings({ model: 'embeddinggemma', prompt: text });
console.log('Raw embedding:', result.embedding);  // Check for NaN
if (!result.embedding.every(Number.isFinite)) {
  // Fallback to simpler text or default vector
}
```

---

## Authority & Versioning

**Canonical source**: `src/lib/server/vector/vector-contracts.ts`

**Version**: Immutable for Phase 8.6–9. May evolve in Phase 10+ if new vector spaces added.

**Code comment**: Any hardcoded dimensions outside vector-contracts.ts must cite this document.

**Validation**:
```bash
npm run audit:vector-dimensions  # (not yet implemented, TODO)
```

---

## Related Documents

- `docs/PHASE-8-6-RERANKER-DEPLOYMENT.md` — Reranker implementation
- `docs/VECTOR-CONTRACTS-ARCHITECTURAL-FIX.md` — Architecture & migration path
- `src/lib/server/vector/vector-contracts.ts` — Source of truth (code)
- `sveltekit-frontend/src/routes/api/retrieval/reranked-search/+server.ts` — Live usage example

---

**Last Updated**: July 11, 2026 (Session 137+)  
**Approved By**: Architecture team (implicit)  
**Questions**: See `docs/architecture/trace-runtime-split.md` or Slack #atlas-team
