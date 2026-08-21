import { describe, expect, it } from 'vitest';

import {
  COLLECTION_CONTRACTS,
  REVISION_FILTER_PAYLOAD_FIELDS,
  buildRevisionFilterIndexPlan,
  PayloadValidationError,
  validateQdrantPayloadForCollection,
} from './qdrant-collection-contracts.js';

describe('qdrant collection contract lineage', () => {
  it('accepts 384 retrieval payloads with explicit projection lineage', () => {
    expect(() =>
      validateQdrantPayloadForCollection('codebase_chunks_384_hybrid', {
        packet_key: 'packet:1',
        source_ref: 'src/lib/server/retrieval/hybrid-search.ts',
        workspace_id: 'sveltekit-frontend',
        ontology_version: 'v1.0',
        postgres_id: '00000000-0000-0000-0000-000000000001',
        content_hash: 'sha256:abc',
        contract_version: 'atlas-qdrant-384-hybrid-v1',
        metadata_schema: 'atlas-semantic-metadata-v1',
        metadata_version: 1,
        file_path: 'src/lib/server/retrieval/hybrid-search.ts',
        language: 'typescript',
        embedding_model: 'embeddinggemma:latest',
        embedding_dimension: 384,
        representation_id: 'legacy_384',
        representation_revision: 12,
        embedding_digest: 'sha256:legacy-example',
        qdrant_vector_dim: 384,
        embedding_lane: 'dense_384',
        embedding_role: 'canonical_online_retrieval',
        embedding_status: 'ACTIVE',
        embedding_native_dimension: 768,
        projection_source_dimension: 768,
        projection_method: 'direct_slice',
        projection_version: 'atlas-embeddinggemma-direct-slice384-v1',
        normalization: 'L2',
        indexed_at: new Date('2026-07-26T00:00:00Z').toISOString(),
      })
    ).not.toThrow();
  });

  it('rejects 384 payloads that claim no projection', () => {
    expect(() =>
      validateQdrantPayloadForCollection('codebase_chunks_384_hybrid', {
        packet_key: 'packet:1',
        source_ref: 'src/lib/server/retrieval/hybrid-search.ts',
        workspace_id: 'sveltekit-frontend',
        ontology_version: 'v1.0',
        postgres_id: '00000000-0000-0000-0000-000000000001',
        content_hash: 'sha256:abc',
        contract_version: 'atlas-qdrant-384-hybrid-v1',
        metadata_schema: 'atlas-semantic-metadata-v1',
        metadata_version: 1,
        file_path: 'src/lib/server/retrieval/hybrid-search.ts',
        language: 'typescript',
        embedding_model: 'embeddinggemma:latest',
        embedding_dimension: 384,
        embedding_lane: 'dense_384',
        projection_method: 'none',
        indexed_at: new Date('2026-07-26T00:00:00Z').toISOString(),
      })
    ).toThrow(PayloadValidationError);
  });

  it('accepts native 768 payloads with dense_768 lane lineage', () => {
    expect(() =>
      validateQdrantPayloadForCollection('codebase_chunks_768', {
        packet_key: 'packet:2',
        source_ref: 'src/lib/server/retrieval/hybrid-search.ts',
        workspace_id: 'sveltekit-frontend',
        ontology_version: 'v1.0',
        postgres_id: '00000000-0000-0000-0000-000000000002',
        content_hash: 'sha256:def',
        contract_version: 'atlas-qdrant-768-source-v1',
        metadata_schema: 'atlas-semantic-metadata-v1',
        metadata_version: 1,
        file_path: 'src/lib/server/retrieval/hybrid-search.ts',
        language: 'typescript',
        embedding_model: 'embeddinggemma:latest',
        embedding_dimension: 768,
        representation_id: 'semantic_768',
        representation_revision: 0,
        embedding_digest: 'sha256:semantic-example',
        qdrant_vector_dim: 768,
        embedding_lane: 'dense_768',
        embedding_role: 'canonical_native_semantic',
        embedding_status: 'REFERENCE_ONLY',
        embedding_native_dimension: 768,
        projection_method: 'none',
        normalization: 'L2',
        indexed_at: new Date('2026-07-26T00:00:00Z').toISOString(),
      })
    ).not.toThrow();
  });

  it('rejects payloads missing workspace or ontology lineage', () => {
    expect(() =>
      validateQdrantPayloadForCollection('codebase_chunks_384_hybrid', {
        packet_key: 'packet:3',
        source_ref: 'src/lib/server/retrieval/hybrid-search.ts',
        postgres_id: '00000000-0000-0000-0000-000000000003',
        content_hash: 'sha256:ghi',
        contract_version: 'atlas-qdrant-384-hybrid-v1',
        metadata_schema: 'atlas-semantic-metadata-v1',
        metadata_version: 1,
        file_path: 'src/lib/server/retrieval/hybrid-search.ts',
        language: 'typescript',
        embedding_model: 'embeddinggemma:latest',
        embedding_dimension: 384,
        representation_id: 'legacy_384',
        embedding_lane: 'dense_384',
        projection_method: 'direct_slice',
        projection_version: 'atlas-embeddinggemma-direct-slice384-v1',
        normalization: 'L2',
        indexed_at: new Date('2026-07-27T00:00:00Z').toISOString(),
      })
    ).toThrow(PayloadValidationError);
  });

  it('rejects 768 payloads with mismatched representation lineage', () => {
    expect(() =>
      validateQdrantPayloadForCollection('codebase_chunks_768', {
        packet_key: 'packet:4',
        source_ref: 'src/lib/server/retrieval/hybrid-search.ts',
        workspace_id: 'sveltekit-frontend',
        ontology_version: 'v1.0',
        postgres_id: '00000000-0000-0000-0000-000000000004',
        content_hash: 'sha256:jkl',
        contract_version: 'atlas-qdrant-768-source-v1',
        metadata_schema: 'atlas-semantic-metadata-v1',
        metadata_version: 1,
        file_path: 'src/lib/server/retrieval/hybrid-search.ts',
        language: 'typescript',
        embedding_model: 'embeddinggemma:latest',
        embedding_dimension: 768,
        representation_id: 'legacy_384',
        embedding_lane: 'dense_768',
        embedding_role: 'canonical_native_semantic',
        embedding_status: 'ACTIVE',
        embedding_native_dimension: 768,
        projection_method: 'none',
        normalization: 'L2',
        indexed_at: new Date('2026-07-26T00:00:00Z').toISOString(),
      })
    ).toThrow(PayloadValidationError);
  });

  it('keeps the hybrid dense lane and sparse lane separate from the 768 native lane', () => {
    expect(COLLECTION_CONTRACTS.codebase_chunks_384_hybrid.vectors.content.size).toBe(384);
    expect(COLLECTION_CONTRACTS.codebase_chunks_384_hybrid.sparseVectors).toEqual(
      expect.objectContaining({ bm42: {} }),
    );
    expect(COLLECTION_CONTRACTS.codebase_chunks_768.vectors.content.size).toBe(768);
    expect(Object.keys(COLLECTION_CONTRACTS.codebase_chunks_768.vectors)).toEqual(
      expect.arrayContaining(['content', 'error', 'signature']),
    );
  });

  it('freezes the EMB3A v2 collection as dense-only with content as the physical vector', () => {
    expect(COLLECTION_CONTRACTS.codebase_chunks_768_v2.vectors).toEqual({
      content: { size: 768, distance: 'Cosine' },
    });
    expect(COLLECTION_CONTRACTS.codebase_chunks_768_v2.sparseVectors).toEqual({});
    expect(COLLECTION_CONTRACTS.codebase_chunks_768_v2.contractVersion).toBe(
      'atlas-qdrant-768-semantic-v2',
    );
  });

  it('keeps revision index planning separate from live index creation', () => {
    const plan = buildRevisionFilterIndexPlan();
    expect(plan.map((entry) => entry.field_name)).toEqual(
      expect.arrayContaining([
        'workspace_revision',
        'source_revision',
        'representation_id',
        'representation_revision',
      ]),
    );
    expect(plan.every((entry) => entry.status === 'BLOCKED_UNTIL_LINEAGE_POPULATED')).toBe(true);
    expect(REVISION_FILTER_PAYLOAD_FIELDS.tree_node_id).toBe('keyword');
  });
});
