import { describe, expect, it } from 'vitest';
import { buildObservationFeatureProjectionV1 } from './observation-feature-projection-v1.js';
import { buildRetrievalRouterFeatureRowV1 } from './retrieval-router-feature-row-v1.js';

describe('Observation Routing Fabric contracts', () => {
  it('projects deterministic AST/ontology masks and flattened tags', () => {
    const input = {
      packetKey: 'packet:db-upsert',
      sourceRef: 'src/lib/db/upsert.ts',
      treeNodeId: 'tree:42',
      sourceVersionReceiptId: 'svr:abc',
      representationId: 'semantic_768',
      representationRevision: 'sem512:r1',
      ontologyClasses: ['RETRIEVAL', 'DATABASE', 'API'],
      astObservationKinds: ['DATABASE_WRITE', 'FUNCTION_CALL', 'OBJECT_LITERAL'],
      langextractClasses: ['algorithm', 'feature'],
      evidenceRefs: ['evidence:2', 'evidence:1', 'evidence:1'],
      featureRevision: 'orf:1',
      producerRevision: 'projection:test',
    } as const;

    const first = buildObservationFeatureProjectionV1(input);
    const second = buildObservationFeatureProjectionV1(input);

    expect(second).toEqual(first);
    expect(first.inputDigest).toBe(second.inputDigest);
    expect(first.ontologyMask).toHaveLength(32);
    expect(first.astPatternMask).toHaveLength(32);
    expect(first.hasDatabaseAccess).toBe(true);
    expect(first.hasCall).toBe(true);
    expect(first.flattenedTags).toContain('ontology=database');
    expect(first.flattenedTags).toContain('ast=database_write');
    expect(first.flattenedTags).toContain('extract=algorithm');
    expect(first.evidenceRefs).toEqual(['evidence:1', 'evidence:2']);
  });

  it('builds semantic_768 + latent_64 router rows without conflating representations', () => {
    const observation = buildObservationFeatureProjectionV1({
      packetKey: 'packet:qdrant-upsert',
      sourceRef: 'src/lib/qdrant/upsert.ts',
      treeNodeId: 'tree:99',
      sourceVersionReceiptId: 'svr:99',
      representationId: 'semantic_768',
      representationRevision: 'sem768:r7',
      ontologyClasses: ['RETRIEVAL', 'VECTOR', 'DATABASE'],
      astObservationKinds: ['FUNCTION_CALL', 'DATABASE_WRITE'],
      langextractClasses: ['api'],
      evidenceRefs: ['span:99'],
      featureRevision: 'orf:7',
      producerRevision: 'projection:7',
    });

    const row = buildRetrievalRouterFeatureRowV1({
      candidateOrdinal: 4,
      canonicalId: 'snapshot-9:tree:99',
      packetKey: 'packet:qdrant-upsert',
      sourceRef: 'src/lib/qdrant/upsert.ts',
      treeNodeId: 'tree:99',
      sourceVersionReceiptId: 'svr:99',
      reconciliationReceiptId: 'reconcile:9',
      workspaceRevision: 742,
      featureRevision: 'orf:7',
      graphRevision: 'graph:338',
      observation,
      semantic: {
        representationId: 'semantic_768',
        representationRevision: 'sem768:r7',
        dimension: 768,
        cosine: 0.91,
      },
      latent: {
        representationId: 'latent_64',
        autoencoderRevision: 'ae:12',
        dimension: 64,
        vector: Array.from({ length: 64 }, (_, index) => index === 0 ? 1 : 0),
      },
      lexical: { bm25Score: 4.2, identifierOverlap: 0.8 },
      graph: { pageRank: 0.002, personalizedPageRank: 0.03, degree: 8, communityId: '41', hopDistance: 2 },
      cluster: { kmeansClusterId: 17, kmeansProbability: 0.88, somRow: 8, somCol: 13, somDistance: 0.14 },
      temporal: { recency: 0.95, changeFrequency: 2, mutationStatus: 'FRESH' },
      evidence: { groundingExact: true, validatorPassed: true, authorityWeight: 0.9 },
    });

    expect(row.semantic.dimension).toBe(768);
    expect(row.semantic.representationId).toBe('semantic_768');
    expect(row.latent?.dimension).toBe(64);
    expect(row.latent?.representationId).toBe('latent_64');
    expect(row.structure.hasDatabaseAccess).toBe(true);
    expect(row.ontology.mask).toHaveLength(32);
    expect(row.rowDigest).toHaveLength(64);
  });

  it('rejects observation/router identity drift', () => {
    const observation = buildObservationFeatureProjectionV1({
      packetKey: 'packet:a',
      sourceRef: 'src/a.ts',
      featureRevision: 'orf:1',
      producerRevision: 'test:1',
    });

    expect(() => buildRetrievalRouterFeatureRowV1({
      candidateOrdinal: 0,
      canonicalId: 'c:1',
      packetKey: 'packet:b',
      sourceRef: 'src/a.ts',
      featureRevision: 'orf:1',
      observation,
      semantic: {
        representationId: 'semantic_768',
        representationRevision: 'sem512:r1',
        dimension: 512,
        cosine: null,
      },
    })).toThrow('ORF_IDENTITY_MISMATCH');
  });
});
