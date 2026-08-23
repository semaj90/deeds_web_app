import { describe, expect, it } from 'vitest';

import {
  SEMANTIC_STORAGE_BOUNDARY_V1,
  validateSemanticStorageBoundaryV1,
  type SemanticRepresentationStorageV1,
} from './semantic-storage-boundary-v1.js';

describe('SemanticStorageBoundaryV1', () => {
  it('keeps PostgreSQL as the only canonical identity owner', () => {
    const entries = validateSemanticStorageBoundaryV1();
    const owners = entries.filter((entry) => entry.authoritativeIdentity);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ store: 'POSTGRES', role: 'CANONICAL_METADATA' });
  });

  it('keeps Qdrant rebuildable and non-authoritative', () => {
    const qdrant = validateSemanticStorageBoundaryV1().filter((entry) => entry.store === 'QDRANT');
    expect(qdrant.length).toBeGreaterThan(0);
    expect(qdrant.every((entry) => entry.rebuildable && !entry.authoritativeIdentity)).toBe(true);
  });

  it('keeps semantic_512, semantic_768, and legacy ingestion 384 distinct', () => {
    const entries = validateSemanticStorageBoundaryV1();
    expect(entries.some((entry) => entry.representationId === 'semantic_512' && entry.dimension === 512)).toBe(true);
    expect(entries.some((entry) => entry.representationId === 'semantic_768' && entry.dimension === 768)).toBe(true);
    expect(entries.some((entry) => entry.representationId === 'legacy_ingestion_384' && entry.dimension === 384)).toBe(true);
  });

  it('rejects Qdrant as canonical identity authority', () => {
    const bad = SEMANTIC_STORAGE_BOUNDARY_V1.map((entry) => ({ ...entry })) as SemanticRepresentationStorageV1[];
    const qdrantIndex = bad.findIndex((entry) => entry.store === 'QDRANT');
    bad[qdrantIndex] = { ...bad[qdrantIndex], authoritativeIdentity: true };
    expect(() => validateSemanticStorageBoundaryV1(bad)).toThrow();
  });

  it('rejects dimensionality drift within a named representation', () => {
    const bad = SEMANTIC_STORAGE_BOUNDARY_V1.map((entry) => ({ ...entry })) as SemanticRepresentationStorageV1[];
    const semantic512 = bad.findIndex((entry) => entry.representationId === 'semantic_512' && entry.store === 'QDRANT');
    bad[semantic512] = { ...bad[semantic512], dimension: 768 };
    expect(() => validateSemanticStorageBoundaryV1(bad)).toThrow('SEMANTIC_512_DIMENSION_MISMATCH');
  });
});
