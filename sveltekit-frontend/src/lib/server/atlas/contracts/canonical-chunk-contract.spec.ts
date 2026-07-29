import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EMBEDDING_DIMENSION,
  CANONICAL_REPRESENTATIONS,
  CanonicalChunkSchema,
  DenseVectorSchema,
  RepresentationDescriptorSchema,
  ServiceReadinessSchema,
  SparseVectorSchema,
  normalizeRepresentationName,
  validateDenseVector,
  validateSparseVector,
} from './canonical-chunk-contract.js';

describe('canonical-chunk-contract', () => {
  const baseChunk = {
    chunkId: '550e8400-e29b-41d4-a716-446655440000',
    workspaceId: '550e8400-e29b-41d4-a716-446655440001',
    workspaceRevision: 'workspace-rev-1',
    sourceRef: 'src/lib/server/example.ts',
    contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    content: 'export const value = 1;',
    language: 'typescript',
    artifactKind: 'source_module',
    domainClasses: ['code'],
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };

  it('parses a canonical chunk record', () => {
    expect(() => CanonicalChunkSchema.parse(baseChunk)).not.toThrow();
  });

  it('parses a canonical representation descriptor', () => {
    expect(() =>
      RepresentationDescriptorSchema.parse({
        chunkId: baseChunk.chunkId,
        name: 'semantic_768',
        producer: 'embeddinggemma',
        modelName: 'embeddinggemma',
        modelRevision: '20260729',
        representationRevision: 'semantic_768@1',
        sourceContentHash: baseChunk.contentHash,
        workspaceRevision: baseChunk.workspaceRevision,
        dimensionality: 768,
        validationState: 'VALIDATED',
      }),
    ).not.toThrow();
  });

  it('normalizes supported legacy aliases to the canonical representation name', () => {
    expect(normalizeRepresentationName('semantic_768')).toBe('semantic_768');
    expect(normalizeRepresentationName('semantic768')).toBe('semantic_768');
    expect(normalizeRepresentationName('dense_768')).toBe('semantic_768');
    expect(normalizeRepresentationName('dense768')).toBe('semantic_768');
    expect(normalizeRepresentationName('latent64')).toBe('latent_64');
  });

  it('rejects reference-only 384 names and unknown representations', () => {
    expect(() => normalizeRepresentationName('semantic_384')).toThrow(/reference-only/);
    expect(() => normalizeRepresentationName('dense_384')).toThrow(/reference-only/);
    expect(() => normalizeRepresentationName('dense_384_custom')).toThrow(/reference-only/);
    expect(() => normalizeRepresentationName('not-a-representation')).toThrow(/Unknown representation name/);
  });

  it('exposes the canonical representation registry with explicit statuses', () => {
    expect(CANONICAL_REPRESENTATIONS.semantic_768.status).toBe('ACTIVE');
    expect(CANONICAL_REPRESENTATIONS.semantic_768.dimension).toBe(768);
    expect(CANONICAL_REPRESENTATIONS.semantic_128.status).toBe('EXPERIMENTAL');
    expect(CANONICAL_REPRESENTATIONS.latent_64.status).toBe('REFERENCE_ONLY');
  });

  it('validates dense vectors with the canonical dimension', () => {
    const dense = Array.from({ length: CANONICAL_EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
    expect(() => validateDenseVector(dense)).not.toThrow();
    expect(() =>
      DenseVectorSchema.parse({
        name: 'semantic_768',
        values: dense,
        representationRevision: 'semantic_768@1',
        modelName: 'embeddinggemma',
        modelRevision: '20260729',
      }),
    ).not.toThrow();
  });

  it('rejects malformed sparse vectors', () => {
    expect(() => validateSparseVector([1, 3, 2], [0.4, 0.3, 0.2])).toThrow(/sorted and unique/);
    expect(() => validateSparseVector([1, 2], [0.4])).toThrow(/differ in length/);
    expect(() =>
      SparseVectorSchema.parse({
        name: 'lexical_v1',
        indices: [117, 933],
        values: [3.2, 2.1],
        vocabularyRevision: 'lexical_v1@1',
        weightingRevision: 'bm25@1',
      }),
    ).not.toThrow();
  });

  it('parses a service readiness envelope', () => {
    expect(() =>
      ServiceReadinessSchema.parse({
        service: 'go-retrieval',
        status: 'READY',
        revision: 'rev-1',
        dependencies: [{ name: 'postgres', status: 'READY', latencyMs: 11 }],
        capabilities: { qdrant: true, postgres: true },
      }),
    ).not.toThrow();
  });
});
