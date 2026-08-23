import { describe, expect, it } from 'vitest';
import { compileRecommendationEvidenceBundleV1, recommendationEvidenceFeatureWeightV1, RecommendationEvidenceBundleV1Schema } from './recommendation-evidence-bundle-v1.js';

const H = 'a'.repeat(64);
const base = {
  schema: 'atlas.recommendation-evidence-bundle.v1' as const,
  requestId: 'req-1', subjectRef: 'packet-1', workspaceRevision: 'w1', sourceRevision: 's1', graphRevision: 'g1',
  representationId: 'semantic_768' as const, representationRevision: 'embgemma-r1', semanticChecksum: H, ordinalMapChecksum: H,
  candidateOrdinals: [0, 1], sample: null, graph: [], knn: null, domain: [], okfSchemaRevision: 'okf-r1', okfFeatureIds: ['domain.fit'],
  parameters: { topK: 10, graphHops: 1, sampleRank: 2, synthesisBudgetTokens: 2048 }, canonicalWritesAllowed: false as const,
  retrievalVoteAdded: false as const, identityAuthority: false as const,
};

describe('recommendation evidence bundle v1', () => {
  it('builds a deterministic revision-qualified bundle', () => {
    const first = compileRecommendationEvidenceBundleV1(base);
    const second = compileRecommendationEvidenceBundleV1(base);
    expect(first.bundleChecksum).toBe(second.bundleChecksum);
    expect(first.identityAuthority).toBe(false);
  });

  it('rejects unproven domain influence', () => {
    const result = RecommendationEvidenceBundleV1Schema.safeParse({
      ...base,
      domain: [{ receiptId: 'd1', producer: 'xgb', producerRevision: 'r1', workspaceRevision: 'w1', sourceRevision: 's1', graphRevision: 'g1', representationRevision: 'embgemma-r1', checksum: H, kind: 'DOMAIN_CLASSIFICATION', taxonomyRevision: 'okf-r1', domainId: 'legal', confidence: 0.8, proofStatus: 'CHALLENGER_UNPROVEN', featureWeight: 0.4, canonicalIdentityAuthority: false }],
      bundleChecksum: H,
    });
    expect(result.success).toBe(false);
  });

  it('accepts low-rank sampling only as non-voting evidence', () => {
    const bundle = compileRecommendationEvidenceBundleV1({
      ...base,
      sample: {
        schema: 'atlas.sample-query-matrix.v1', matrixRole: 'LATENT_ROUTING', normalization: 'ROW_L2',
        candidateSnapshotRevision: 'candidate-r1', workspaceRevision: 'w1', sourceMatrixRevision: 'matrix-r1',
        sourceMatrixChecksum: H, ordinalMapChecksum: H, rowCount: 2, columnCount: 128,
        rows: [{ candidateOrdinal: 0, values: [1], rowNormSquared: 1 }], totalRowNormSquared: 1,
        rowNormCoefficientOfVariation: 0, lengthSquaredDegeneratesTowardUniform: true,
        matrixChecksum: H, identityAuthority: false, retrievalVoteProduced: false,
        canonicalWritesAttempted: false, producerRevision: 'sample-r1',
      },
    });
    expect(bundle.sample?.retrievalVoteProduced).toBe(false);
    expect(recommendationEvidenceFeatureWeightV1(bundle)).toBeGreaterThan(0);
  });

  it('rejects KNN ordinal-map drift and invalid parameter bounds', () => {
    expect(() => compileRecommendationEvidenceBundleV1({
      ...base,
      parameters: { ...base.parameters, graphHops: 3 },
      knn: { receiptId: 'k1', producer: 'cuvs', producerRevision: 'r1', workspaceRevision: 'w1', sourceRevision: 's1', graphRevision: 'g1', representationRevision: 'embgemma-r1', checksum: H, kind: 'KNN_TOPK', metric: 'COSINE_SIMILARITY', topK: 2, ordinalMapChecksum: 'b'.repeat(64), hits: [] },
    })).toThrow();
  });
});
