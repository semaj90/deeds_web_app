import { describe, expect, it } from 'vitest';
import {
  compileRecommendationEvidenceBundleV1,
  verifyRecommendationEvidenceBundleV1,
} from './recommendation-evidence-bundle-v1.js';

const H = 'a'.repeat(64);
const BASE = {
  schema: 'atlas.recommendation-evidence-bundle.v1' as const,
  requestId: 'readback-fixture', subjectRef: 'packet:fixture',
  workspaceRevision: 'workspace-r1', sourceRevision: 'source-r1',
  graphRevision: 'graph-r1', representationId: 'semantic_768' as const,
  representationRevision: 'semantic-r1', semanticChecksum: H,
  ordinalMapChecksum: H, candidateOrdinals: [0, 1],
  sample: null, graph: [], knn: null, domain: [],
  okfSchemaRevision: 'okf-r1', okfFeatureIds: ['domain.fit'],
  parameters: { topK: 10, graphHops: 1, sampleRank: 2, synthesisBudgetTokens: 2048 },
  canonicalWritesAllowed: false as const, retrievalVoteAdded: false as const,
  identityAuthority: false as const,
};
const KNN = {
  receiptId: 'knn-receipt-1', producer: 'fixture', producerRevision: 'producer-r1',
  workspaceRevision: BASE.workspaceRevision, sourceRevision: BASE.sourceRevision,
  graphRevision: BASE.graphRevision, representationRevision: BASE.representationRevision,
  checksum: H, kind: 'KNN_TOPK' as const, metric: 'COSINE_SIMILARITY' as const,
  topK: 2, ordinalMapChecksum: H,
  hits: [
    { candidateOrdinal: 0, canonicalId: 'cid:0', rank: 1, score: 0.8 },
    { candidateOrdinal: 1, canonicalId: 'cid:1', rank: 2, score: 0.6 },
  ],
};

describe('recommendation evidence bundle independent readback', () => {
  it('verifies a real v1 compositor checksum on a replayed bundle', () => {
    const out = compileRecommendationEvidenceBundleV1({ ...BASE, knn: KNN });
    expect(() => verifyRecommendationEvidenceBundleV1(JSON.parse(JSON.stringify(out)))).not.toThrow();
  });
  it('rejects payload tampering even when the schema still parses', () => {
    const out = compileRecommendationEvidenceBundleV1(BASE);
    expect(() => verifyRecommendationEvidenceBundleV1({ ...out, okfFeatureIds: ['changed'] })).toThrow('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  });
  it('rejects duplicate selected ordinals during composition', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE, candidateOrdinals: [0, 0] })).toThrow('RECOMMENDATION_BUNDLE_DUPLICATE_ORDINAL');
  });
  it('rejects sample ordinal-map drift', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      sample: {
        schema: 'atlas.sample-query-matrix.v1' as const, matrixRole: 'LATENT_ROUTING' as const,
        rows: 2, columns: 64, samplingAxis: 'ROW' as const,
        samplingPolicy: 'LENGTH_SQUARED' as const, normalization: 'ROW_L2' as const,
        candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: 'b'.repeat(64),
        canonicalIdentityAuthority: false as const, retrievalVoteAdded: false as const,
        matrixChecksum: H,
      },
    })).toThrow('RECOMMENDATION_BUNDLE_SAMPLE_ORDINAL_DRIFT');
  });
  it('rejects KNN evidence from another source revision', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, sourceRevision: 'source-r2' },
    })).toThrow('RECOMMENDATION_KNN_SOURCE_REVISION_MISMATCH');
  });
  it('rejects duplicated KNN rank', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, hits: KNN.hits.map(x => ({...x, rank: 1})) },
    })).toThrow('RECOMMENDATION_KNN_DUPLICATE_OR_INVALID_RANK');
  });
  it('rejects a KNN result beyond its declared topK', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, topK: 1 },
    })).toThrow('RECOMMENDATION_KNN_TOPK_EXCEEDED');
  });
  it('does not upgrade the result to canonical or authorize writes', () => {
    const out = compileRecommendationEvidenceBundleV1(BASE);
    expect(out.canonicalWritesAllowed).toBe(false);
    expect(out.identityAuthority).toBe(false);
    expect(out.retrievalVoteAdded).toBe(false);
  });
});
