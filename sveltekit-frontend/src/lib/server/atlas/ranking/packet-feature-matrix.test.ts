import { describe, expect, it } from 'vitest';

import {
  buildPacketFeatureMatrixFromPackets,
  buildPacketFeatureRowsFromPackets,
  buildPacketFeatureMatrix,
  getPacketFeatureRow,
  normalizeDemandUtility,
  bridgePacketFeatureRowToFeatureRowV1,
  proveCanonicalIdentityRoundTripV1,
  type PacketFeatureRow,
} from './packet-feature-matrix.js';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';

describe('packet-feature-matrix', () => {
  it('builds a stable row-major matrix', () => {
    const matrix = buildPacketFeatureMatrix([
      {
        packetKey: 'packet:1',
        semanticScore: 0.9,
        centroidAffinity: 0.8,
        quaternionAffinity: 0.7,
        graphAuthority: 0.6,
        demandUtility: normalizeDemandUtility({ hits24h: 10, avgRerank: 0.5, maxObservedHotScore: 20 }),
        executionUtility: 0.4,
        recency: 0.3,
        cacheHotness: 0.2,
        normalizedCost: 0.1,
      },
    ]);

    expect(matrix.rows).toBe(1);
    expect(matrix.cols).toBe(9);
    expect(matrix.packetKeys).toEqual(['packet:1']);
    expect(getPacketFeatureRow(matrix, 0)).toHaveLength(9);
  });

  it('derives feature rows from ranked packets deterministically', () => {
    const rows = buildPacketFeatureRowsFromPackets([
      {
        packetKey: 'packet:ranked',
        tokenCount: 24,
        vector: [0.25, 0.75, 0.6, 0.5, 0.4, 0.8, 0.9, 0.2, 0.1],
      },
    ]);

    expect(rows).toEqual([
      {
        packetKey: 'packet:ranked',
        semanticScore: 0.75,
        centroidAffinity: 0.4,
        quaternionAffinity: 0.6,
        graphAuthority: 0.5,
        demandUtility: normalizeDemandUtility({ hits24h: 25, avgRerank: 0.75, maxObservedHotScore: 100 }),
        executionUtility: 0.9,
        recency: 0.8,
        cacheHotness: 0.2,
        normalizedCost: 0.1,
      },
    ]);

    const matrix = buildPacketFeatureMatrixFromPackets([
      {
        packetKey: 'packet:ranked',
        tokenCount: 24,
        vector: [0.25, 0.75, 0.6, 0.5, 0.4, 0.8, 0.9, 0.2, 0.1],
      },
    ]);

    expect(matrix.packetKeys).toEqual(['packet:ranked']);
    expect(getPacketFeatureRow(matrix, 0)).toEqual(new Float32Array([
      0.75, 0.4, 0.6, 0.5, rows[0].demandUtility, 0.9, 0.8, 0.2, 0.1,
    ]));
  });

  describe('PA-FE-01: FeatureRowV1 bridging and canonical identity round-trip', () => {
    const sampleLocator: EvidenceLocatorV1 = {
      schema: 'atlas.evidence-locator.v1',
      canonicalId: 'canonical:chunk:42',
      packetKey: 'packet:42',
      sourceRef: 'src/lib/server/retrieval/service.ts#L40-L60',
      sourceKind: 'code_file',
      filePath: 'src/lib/server/retrieval/service.ts',
      sourceUrl: null,
      contentHash: 'sha256:7777777777777777777777777777777777777777777777777777777777777777',
      workspaceRevision: 'ws-rev-42',
      sourceRevision: 'src-rev-42',
      span: { startByte: 1024, endByte: 2048 },
      domain: null,
    };

    const samplePacketRow: PacketFeatureRow = {
      packetKey: 'packet:42',
      semanticScore: 0.88,
      centroidAffinity: 0.72,
      quaternionAffinity: 0.65,
      graphAuthority: 0.81,
      demandUtility: 0.55,
      executionUtility: 0.9,
      recency: 0.78,
      cacheHotness: 0.3,
      normalizedCost: 0.15,
    };

    const sampleSemanticEvidence = {
      packetKey: 'packet:42',
      canonicalId: 'canonical:chunk:42',
      sourceRef: sampleLocator.sourceRef,
      workspaceRevision: sampleLocator.workspaceRevision,
      sourceRevision: sampleLocator.sourceRevision,
      representationId: 'semantic_768' as const,
      representationRevision: 'sem-rev-768',
      queryRecipe: {
        representationId: 'semantic_768', representationRevision: 'sem-rev-768',
        modelArtifactRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', inputPolicyRevision: 'policy:r1',
        promptRevision: 'prompt:r1', mode: 'retrieval_query', dimension: 768, metric: 'COSINE', normalization: 'L2', inputChecksum: '1'.repeat(64),
      },
      documentRecipe: {
        representationId: 'semantic_768', representationRevision: 'sem-rev-768',
        modelArtifactRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', inputPolicyRevision: 'policy:r1',
        promptRevision: 'prompt:r1', mode: 'retrieval_document', dimension: 768, metric: 'COSINE', normalization: 'L2', inputChecksum: '2'.repeat(64),
      },
    };

    const samplePageRank = {
      runId: 'pagerank-run-42',
      graphRevision: 'graph-rev-v1',
      status: 'promoted' as const,
      didConverge: true as const,
      pagerank_l1: 0.81,
    };

    it('bridges live PacketFeatureRow into staged FeatureRowV1 without losing identity or signals', () => {
      const featureRow = bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: samplePageRank,
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        sparse: 0.45,
        rrf: 0.82,
        ast: 0.6,
        pprAffinity: 0.35,
        crossEncoder: 0.91,
        evidenceRefs: ['evidence:ref:42'],
      });

      expect(featureRow.schema).toBe('atlas.feature-row.v1');
      expect(featureRow.packetKey).toBe('packet:42');
      expect(featureRow.canonicalId).toBe('canonical:chunk:42');
      expect(featureRow.sourceRef).toBe('src/lib/server/retrieval/service.ts#L40-L60');
      expect(featureRow.workspaceRevision).toBe('ws-rev-42');
      expect(featureRow.sourceRevision).toBe('src-rev-42');
      expect(featureRow.dense).toBe(0.88);
      expect(featureRow.domainAffinity).toBe(0.72);
      expect(featureRow.pagerankAuthority).toBe(0.81);
      expect(featureRow.executionUtility).toBe(0.9);
      expect(featureRow.freshness).toBe(0.78);
      expect(featureRow.crossEncoder).toBe(0.91);
      expect(featureRow.evidenceRefs).toEqual(['evidence:ref:42']);
    });

    it('proves canonical identity round-trip: candidate -> packetKey/canonicalId -> FeatureRowV1 -> exact evidence', () => {
      const featureRow = bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: samplePageRank,
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      });

      const evidenceStore = new Map<string, EvidenceLocatorV1>([
        ['evidence:ref:42', sampleLocator],
      ]);

      const candidate = {
        packetKey: 'packet:42',
        canonicalId: 'canonical:chunk:42',
      };

      const proof = proveCanonicalIdentityRoundTripV1({
        candidate,
        locator: sampleLocator,
        featureRow,
        evidenceStore,
      });

      expect(proof.roundTripProven).toBe(true);
      expect(proof.candidatePacketKey).toBe(candidate.packetKey);
      expect(proof.canonicalId).toBe(candidate.canonicalId);
      expect(proof.featureRowPacketKey).toBe(featureRow.packetKey);
      expect(proof.sourceRef).toBe(sampleLocator.sourceRef);
      expect(proof.contentHash).toBe(sampleLocator.contentHash);
      expect(proof.verifiedEvidenceRef).toBe('evidence:ref:42');
    });

    it('fails closed on identity or content hash drift during round-trip proof', () => {
      const featureRow = bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: samplePageRank,
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      });

      const driftedLocator: EvidenceLocatorV1 = {
        ...sampleLocator,
        contentHash: 'sha256:drifted_hash_value',
      };

      const evidenceStore = new Map<string, EvidenceLocatorV1>([
        ['evidence:ref:42', driftedLocator],
      ]);

      expect(() =>
        proveCanonicalIdentityRoundTripV1({
          candidate: { packetKey: 'packet:42', canonicalId: 'canonical:chunk:42' },
          locator: sampleLocator,
          featureRow,
          evidenceStore,
        })
      ).toThrow(/ROUND_TRIP_CONTENT_HASH_MISMATCH/);

      expect(() =>
        proveCanonicalIdentityRoundTripV1({
          candidate: { packetKey: 'packet:different', canonicalId: 'canonical:chunk:42' },
          locator: sampleLocator,
          featureRow,
          evidenceStore: new Map([['evidence:ref:42', sampleLocator]]),
        })
      ).toThrow(/ROUND_TRIP_PACKET_KEY_DRIFT/);

      expect(() => proveCanonicalIdentityRoundTripV1({
        candidate: { packetKey: 'packet:42', canonicalId: ' ' },
        locator: sampleLocator,
        featureRow,
        evidenceStore: new Map([['evidence:ref:42', sampleLocator]]),
      })).toThrow('ROUND_TRIP_CANONICAL_ID_REQUIRED');
    });

    it('rejects source revision and source-location drift in the resolved locator', () => {
      const featureRow = bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: samplePageRank,
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      });

      expect(() => proveCanonicalIdentityRoundTripV1({
        candidate: { packetKey: 'packet:42', canonicalId: 'canonical:chunk:42' },
        locator: sampleLocator,
        featureRow,
        evidenceStore: new Map([['evidence:ref:42', { ...sampleLocator, sourceRevision: 'src-rev-stale' }]]),
      })).toThrow(/ROUND_TRIP_SOURCE_REVISION_MISMATCH/);

      expect(() => proveCanonicalIdentityRoundTripV1({
        candidate: { packetKey: 'packet:42', canonicalId: 'canonical:chunk:42' },
        locator: sampleLocator,
        featureRow,
        evidenceStore: new Map([['evidence:ref:42', { ...sampleLocator, filePath: 'src/other.ts' }]]),
      })).toThrow(/ROUND_TRIP_FILE_PATH_MISMATCH/);
    });

    it('rejects semantic evidence bound to a different identity or revision', () => {
      const bridge = (semanticEvidence: typeof sampleSemanticEvidence) => bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence,
        pagerank: samplePageRank,
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      });

      expect(() => bridge({ ...sampleSemanticEvidence, packetKey: 'packet:other' }))
        .toThrow('FEATURE_ROW_SEMANTIC_PACKET_KEY_MISMATCH');
      expect(() => bridge({ ...sampleSemanticEvidence, sourceRevision: 'src-rev-stale' }))
        .toThrow('FEATURE_ROW_SEMANTIC_SOURCE_REVISION_MISMATCH');
      expect(() => bridge({ ...sampleSemanticEvidence, representationRevision: 'sem-rev-stale' }))
        .toThrow('FEATURE_ROW_SEMANTIC_REVISION_MISMATCH');
      expect(() => bridge({ ...sampleSemanticEvidence, representationId: 'semantic_384' as 'semantic_768' }))
        .toThrow('FEATURE_ROW_SEMANTIC_REPRESENTATION_UNSUPPORTED:semantic_384');
      expect(() => bridge({
        ...sampleSemanticEvidence,
        queryRecipe: { ...sampleSemanticEvidence.queryRecipe, promptRevision: 'prompt:stale' },
      })).toThrow('SEMANTIC_QUERY_DOCUMENT_RECIPE_MISMATCH:promptRevision');
    });

    it('rejects unpromoted or unconverged PageRank instead of using packet scalar authority', () => {
      expect(() => bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: { ...samplePageRank, status: 'shadow' as 'promoted' },
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      })).toThrow('FEATURE_ROW_PAGERANK_NOT_PROMOTED');

      expect(() => bridgePacketFeatureRowToFeatureRowV1({
        packetRow: samplePacketRow,
        locator: sampleLocator,
        semanticEvidence: sampleSemanticEvidence,
        pagerank: { ...samplePageRank, didConverge: false as true },
        featureRevision: 'feat-rev-v1',
        semanticRevision: 'sem-rev-768',
        evidenceRefs: ['evidence:ref:42'],
      })).toThrow('FEATURE_ROW_PAGERANK_CONVERGENCE_UNVERIFIED');
    });
  });
});
