import { describe, expect, it } from 'vitest';
import {
  QDRANT_CODEBASE_768_INDEX_PLAN,
  compareQdrantSchemaToPlan,
  qdrantRepresentationIndexPlanDigest,
} from './qdrant-representation-index-plan-v1.js';

describe('QdrantRepresentationIndexPlanV1', () => {
  it('keeps sparse lexical representations independent from EmbeddingGemma dense vectors', () => {
    const bm25 = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'bm25');
    const minicoil = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'minicoil');
    const semantic = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'semantic_768');

    expect(semantic?.storage).toBe('DENSE_VECTOR');
    expect(semantic?.modelFamily).toContain('embeddinggemma');
    expect(bm25?.storage).toBe('SPARSE_VECTOR');
    expect(bm25?.derivedFrom).toBeNull();
    expect(minicoil?.storage).toBe('SPARSE_VECTOR');
    expect(minicoil?.derivedFrom).toBeNull();
  });

  it('indexes revision/identity routing fields but not score/cluster feature fields by default', () => {
    const indexed = new Set(QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes.filter((field) => field.indexByDefault).map((field) => field.fieldName));
    expect(indexed).toContain('canonical_id');
    expect(indexed).toContain('packet_key');
    expect(indexed).toContain('workspace_revision');
    expect(indexed).toContain('source_revision');
    expect(indexed).not.toContain('pagerank');
    expect(indexed).not.toContain('som_cluster');
    expect(indexed).not.toContain('kmeans_cluster');
  });

  it('reports READY for an exact schema match', () => {
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        semantic_768: { size: 768, distance: 'Cosine' },
        semantic_mrl_512: { size: 512, distance: 'Cosine' },
      },
      sparseVectors: {
        bm25: { modifier: 'idf' },
        minicoil: { modifier: 'idf' },
        splade: { modifier: null },
      },
      payloadSchema: Object.fromEntries(
        QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes
          .filter((field) => field.indexByDefault)
          .map((field) => [field.fieldName, field.fieldSchema]),
      ),
    });
    expect(drift.status).toBe('READY');
    expect(drift.applyAllowed).toBe(false);
  });

  it('reports CONFIG_DRIFT for a wrong dense dimension before missing fields', () => {
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        semantic_768: { size: 512, distance: 'Cosine' },
      },
      sparseVectors: {},
      payloadSchema: {},
    });
    expect(drift.status).toBe('CONFIG_DRIFT');
    expect(drift.representationConfigDrift).toContain('semantic_768');
    expect(drift.missingRepresentations).toContain('bm25');
  });

  it('reports TYPE_DRIFT for an indexed payload field with the wrong type', () => {
    const payloadSchema = Object.fromEntries(
      QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes
        .filter((field) => field.indexByDefault)
        .map((field) => [field.fieldName, field.fieldSchema]),
    );
    payloadSchema.workspace_revision = 'integer';
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        semantic_768: { size: 768, distance: 'Cosine' },
        semantic_mrl_512: { size: 512, distance: 'Cosine' },
      },
      sparseVectors: {
        bm25: { modifier: 'idf' },
        minicoil: { modifier: 'idf' },
        splade: { modifier: null },
      },
      payloadSchema,
    });
    expect(drift.status).toBe('TYPE_DRIFT');
    expect(drift.payloadTypeDrift).toEqual(['workspace_revision']);
  });

  it('has a stable SHA256 plan digest', () => {
    expect(qdrantRepresentationIndexPlanDigest()).toMatch(/^[a-f0-9]{64}$/);
    expect(qdrantRepresentationIndexPlanDigest()).toBe(qdrantRepresentationIndexPlanDigest());
  });
});
