import { describe, expect, it } from 'vitest';
import { getCollectionDimension, VECTOR_CONFIG } from './vector-config.js';

describe('retired Qdrant collection provisioning', () => {
  it('keeps legacy collection identities readable without provisioning them on startup', () => {
    expect(VECTOR_CONFIG.COLLECTIONS.codebase_chunks_384).toBe('codebase_chunks_384');
    expect(VECTOR_CONFIG.COLLECTIONS.codebase_chunks_384_hybrid).toBe('codebase_chunks_384_hybrid');
    expect(getCollectionDimension('codebase_chunks_384')).toBe(384);
    expect(getCollectionDimension('codebase_chunks_384_hybrid')).toBe(384);
    expect(VECTOR_CONFIG.COLLECTION_VECTORS).not.toHaveProperty('codebase_chunks_384');
    expect(VECTOR_CONFIG.COLLECTION_VECTORS).not.toHaveProperty('codebase_chunks_384_hybrid');
  });
});
