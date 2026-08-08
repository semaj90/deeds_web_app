import { describe, expect, it } from 'vitest';

import { VECTOR_INDEX_REGISTRY } from '$lib/server/vector/vector-index-registry.js';

/**
 * Static contract proof for the canonical SearchRuntime dense lane, per the
 * embedding-dimension-drift risk raised during the LOD-taxonomy authority
 * audit (2026-08-08): this repo has both a canonical 768-dim EmbeddingGemma
 * contract AND substantial leftover 384-dim infrastructure
 * (codebase_chunks_384_hybrid, embeddinggemma-prefix384.ts's legacy slice
 * contract), so the collection SearchRuntime actually queries must be
 * asserted, not assumed from naming alone.
 *
 * The dynamic half of this proof (a 768-lane call never silently accepting
 * a short/384-dim vector) lives in embedding-service.test.ts — this file
 * covers the static half: the registry entry retrieve-candidates.ts's
 * retrieveQdrant() hardcodes (`VECTOR_INDEX_REGISTRY.qdrantSource768V2`,
 * see retrieve-candidates.ts:365,428) really is the 768-dim canonical
 * contract, not a 384 lane under a misleading name.
 */
describe('canonical SearchRuntime dense lane — embedding dimension contract', () => {
  it('qdrantSource768V2 (the entry retrieveQdrant() actually queries) declares a 768-dim, canonical, unmutated EmbeddingGemma contract', () => {
    const entry = VECTOR_INDEX_REGISTRY.qdrantSource768V2;

    expect(entry.collection).toBe('codebase_chunks_768_v2');
    expect(entry.vectorContract.dimension).toBe(768);
    expect(entry.vectorContract.sourceDimension).toBe(768);
    expect(entry.vectorContract.outputDimension).toBe(768);
    expect(entry.vectorContract.canonical).toBe(true);
    expect(entry.vectorContract.truncation).toBe('none');
  });

  it('the 384-dim legacy lane is explicitly marked non-canonical — must never be confused with the dense retrieval lane', () => {
    const legacy384 = VECTOR_INDEX_REGISTRY.qdrantDense;

    expect(legacy384.vectorContract.dimension).toBe(384);
    expect(legacy384.vectorContract.canonical).toBe(false);
    // Guards against a future edit accidentally "fixing" this to true, which
    // would make a 384-dim lane pass any `canonical === true` check callers
    // might reasonably add elsewhere in the retrieval path.
  });
});
