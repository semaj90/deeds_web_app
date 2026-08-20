import { describe, expect, it } from 'vitest';
import { representationFit, shouldEmbedBareValue } from './representation-fit.js';

describe('representation fit taxonomy', () => {
  it('keeps hashes and hex data exact rather than semantic', () => {
    const hash = representationFit('HASH_DIGEST');
    expect(hash.comparison).toBe('EXACT');
    expect(hash.canonicalPhysical).toBe('FIXED_BYTES');
    expect(hash.semanticEmbeddingAllowed).toBe(false);
    expect(shouldEmbedBareValue('HEX_BYTES')).toBe(false);
  });

  it('treats heterogeneous tuples as typed structured values', () => {
    const tuple = representationFit('TUPLE');
    expect(tuple.requiresTypeManifest).toBe(true);
    expect(tuple.comparison).toBe('STRUCTURAL');
    expect(tuple.gpuBatchAllowed).toBe(false);
  });

  it('uses columnar representation for tables and allows GPU batching', () => {
    const table = representationFit('TABLE');
    expect(table.canonicalPhysical).toBe('ARROW');
    expect(table.gpuBatchAllowed).toBe(true);
  });

  it('keeps semantic search on text/dense representations rather than identity digests', () => {
    expect(representationFit('TEXT_SPAN').semanticEmbeddingAllowed).toBe(true);
    expect(representationFit('DENSE_VECTOR').uses).toContain('SEMANTIC_SEARCH');
    expect(representationFit('HASH_DIGEST').uses).not.toContain('SEMANTIC_SEARCH');
  });
});
