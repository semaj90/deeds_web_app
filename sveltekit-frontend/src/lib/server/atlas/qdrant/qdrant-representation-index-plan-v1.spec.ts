import { describe, expect, it } from 'vitest';
import {
  QDRANT_CODEBASE_768_INDEX_PLAN,
  compareQdrantSchemaToPlan,
  qdrantRepresentationIndexPlanDigest,
} from './qdrant-representation-index-plan-v1.js';

describe('QdrantRepresentationIndexPlanV1', () => {
  it('preserves proven physical dense slots without inventing historical model provenance', () => {
    const content = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'content');
    const error = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'error');
    const signature = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === 'signature');

    expect(content?.logicalRepresentation).toBe('semantic_768');
    expect(content?.dimensions).toBe(768);
    expect(content?.modelFamily).toBe('UNPROVEN_HISTORICAL_MODEL');
    expect(error?.dimensions).toBe(768);
    expect(signature?.dimensions).toBe(768);
  });

  it('keeps BM25, miniCOIL, and SPLADE as independent sparse text representations', () => {
    for (const name of ['bm25', 'minicoil', 'splade']) {
      const representation = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === name);
      expect(representation?.storage).toBe('SPARSE_VECTOR');
      expect(representation?.derivedFrom).toBeNull();
    }
  });

  it('requires BM25 for target readiness but keeps MRL/miniCOIL/SPLADE optional challengers', () => {
    const required = new Set(QDRANT_CODEBASE_768_INDEX_PLAN.representations.filter((entry) => entry.requiredForReady).map((entry) => entry.name));
    expect(required).toContain('content');
    expect(required).toContain('error');
    expect(required).toContain('signature');
    expect(required).toContain('bm25');
    expect(required).not.toContain('semantic_mrl_512');
    expect(required).not.toContain('minicoil');
    expect(required).not.toContain('splade');
  });

  it('indexes identity/routing fields while refusing score and cluster feature indexes by default', () => {
    const indexed = new Set(QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes.filter((field) => field.indexByDefault).map((field) => field.fieldName));
    expect(indexed).toContain('canonical_id');
    expect(indexed).toContain('packet_key');
    expect(indexed).toContain('workspace_revision');
    expect(indexed).toContain('source_revision');
    expect(indexed).not.toContain('pagerank');
    expect(indexed).not.toContain('som_cluster');
    expect(indexed).not.toContain('kmeans_cluster');
  });

  it('reports READY when required schema exists even if optional challengers are absent', () => {
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        content: { size: 768, distance: 'Cosine' },
        error: { size: 768, distance: 'Cosine' },
        signature: { size: 768, distance: 'Cosine' },
      },
      sparseVectors: { bm25: { modifier: 'idf' } },
      payloadSchema: {
        canonical_id: 'keyword',
        packet_key: 'keyword',
      },
    });
    expect(drift.status).toBe('READY');
    expect(drift.missingOptionalRepresentations).toEqual(['minicoil', 'semantic_mrl_512', 'splade']);
    expect(drift.applyAllowed).toBe(false);
  });

  it('reports CONFIG_DRIFT for a wrong required dense dimension', () => {
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        content: { size: 512, distance: 'Cosine' },
        error: { size: 768, distance: 'Cosine' },
        signature: { size: 768, distance: 'Cosine' },
      },
      sparseVectors: { bm25: { modifier: 'idf' } },
      payloadSchema: { canonical_id: 'keyword', packet_key: 'keyword' },
    });
    expect(drift.status).toBe('CONFIG_DRIFT');
    expect(drift.representationConfigDrift).toEqual(['content']);
  });

  it('reports MISSING when required BM25 is absent', () => {
    const drift = compareQdrantSchemaToPlan({
      denseVectors: {
        content: { size: 768, distance: 'Cosine' },
        error: { size: 768, distance: 'Cosine' },
        signature: { size: 768, distance: 'Cosine' },
      },
      sparseVectors: {},
      payloadSchema: { canonical_id: 'keyword', packet_key: 'keyword' },
    });
    expect(drift.status).toBe('MISSING');
    expect(drift.missingRequiredRepresentations).toEqual(['bm25']);
  });

  it('has a stable SHA256 plan digest', () => {
    expect(qdrantRepresentationIndexPlanDigest()).toMatch(/^[a-f0-9]{64}$/);
    expect(qdrantRepresentationIndexPlanDigest()).toBe(qdrantRepresentationIndexPlanDigest());
  });
});
