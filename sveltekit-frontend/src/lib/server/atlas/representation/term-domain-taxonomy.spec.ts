import { describe, expect, it } from 'vitest';
import {
  classifyAtlasTerm,
  mayCreateCanonicalStructuralRelation,
} from './term-domain-taxonomy.js';

describe('term/domain taxonomy', () => {
  it('separates Hilbert space from Hilbert locality ordering', () => {
    expect(classifyAtlasTerm('Hilbert space')?.domain).toBe('VECTOR_GEOMETRY');
    expect(classifyAtlasTerm('Hilbert sort')?.domain).toBe('LOCALITY_ORDER');
  });

  it('classifies Leiden/Louvain as community partitions, not relation facts', () => {
    expect(classifyAtlasTerm('Leiden')?.relationInferenceRole).toBe('PARTITION_FEATURE');
    expect(classifyAtlasTerm('Louvain')?.relationInferenceRole).toBe('PARTITION_FEATURE');
    expect(mayCreateCanonicalStructuralRelation('Leiden')).toBe(false);
    expect(mayCreateCanonicalStructuralRelation('Louvain')).toBe(false);
  });

  it('classifies Manhattan and cosine as vector metrics', () => {
    expect(classifyAtlasTerm('Manhattan distance')?.domain).toBe('VECTOR_METRIC');
    expect(classifyAtlasTerm('cosine similarity')?.domain).toBe('VECTOR_METRIC');
  });

  it('keeps tricubic interpolation in hardware-response modeling', () => {
    const entry = classifyAtlasTerm('tricubic interpolation');
    expect(entry?.domain).toBe('INTERPOLATION');
    expect(entry?.relationInferenceRole).toBe('HARDWARE_RESPONSE_MODEL');
  });

  it('keeps Merkle hashes for integrity rather than relevance', () => {
    expect(classifyAtlasTerm('merkel')?.canonicalTerm).toBe('merkle');
    expect(classifyAtlasTerm('merkle')?.relationInferenceRole).toBe('INTEGRITY_ONLY');
  });

  it('does not treat Fibonacci/golden section as graph-search laws', () => {
    expect(classifyAtlasTerm('fibonacci')?.forbiddenClaims).toContain('not a generic graph branching law');
    expect(classifyAtlasTerm('golden ratio search')?.domain).toBe('SCALAR_OPTIMIZATION');
  });

  it('keeps semantic similarity from manufacturing source relations', () => {
    expect(mayCreateCanonicalStructuralRelation('cosine')).toBe(false);
    expect(mayCreateCanonicalStructuralRelation('pca')).toBe(false);
    expect(mayCreateCanonicalStructuralRelation('pagerank')).toBe(false);
  });
});
