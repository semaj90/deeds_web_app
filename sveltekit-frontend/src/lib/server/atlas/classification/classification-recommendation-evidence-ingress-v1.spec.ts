import { describe, expect, it } from 'vitest';
import {
  compileRecommendationEvidenceBundleV1,
} from '../recommendations/recommendation-evidence-bundle-v1.js';
import { runClassificationControlPlaneV1 } from './classification-control-plane-v1.js';

const SHA = 'a'.repeat(64);
const base = {
  schema: 'atlas.recommendation-evidence-bundle.v1' as const,
  requestId: 'ingress-request',
  subjectRef: 'packet:ingress-fixture',
  workspaceRevision: 'workspace-r1',
  sourceRevision: 'source-r1',
  graphRevision: null,
  representationId: 'semantic_768' as const,
  representationRevision: 'representation-r1',
  semanticChecksum: SHA,
  ordinalMapChecksum: SHA,
  candidateOrdinals: [0],
  sample: null,
  graph: [],
  knn: null,
  domain: [],
  okfSchemaRevision: 'okf-r1',
  okfFeatureIds: ['domain.fit'],
  parameters: {
    topK: 1,
    graphHops: 0,
    sampleRank: 0,
    synthesisBudgetTokens: 128,
  },
  canonicalWritesAllowed: false as const,
  retrievalVoteAdded: false as const,
  identityAuthority: false as const,
};

function invoke(recommendationEvidence?: unknown) {
  return runClassificationControlPlaneV1({
    requestId: base.requestId,
    workspaceRevision: base.workspaceRevision,
    query: 'test request',
    candidates: [],
    recommendationEvidence,
  });
}

describe('classification recommendation evidence ingress', () => {
  it('preserves the absent-bundle path', async () => {
    const result = await invoke();
    expect(result.recommendationEvidence).toBeNull();
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.retrievalVoteAdded).toBe(false);
  });

  it('accepts a independently-verified serialized bundle', async () => {
    const bundle = compileRecommendationEvidenceBundleV1(base);
    const received = JSON.parse(JSON.stringify(bundle));
    const result = await invoke(received);
    expect(result.recommendationEvidence?.bundleChecksum).toBe(bundle.bundleChecksum);
    expect(result.canonicalWritesAllowed).toBe(false);
  });

  it('rejects checksum-valid schema content that was tampered after sealing', async () => {
    const bundle = compileRecommendationEvidenceBundleV1(base);
    await expect(invoke({ ...bundle, subjectRef: 'packet:tampered' }))
      .rejects.toThrow('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  });

  it('rejects a fully resealed request-id mismatch', async () => {
    const bundle = compileRecommendationEvidenceBundleV1({ ...base, requestId: 'different-request' });
    await expect(invoke(bundle))
      .rejects.toThrow('RECOMMENDATION_EVIDENCE_REQUEST_MISMATCH');
  });

  it('rejects a fully resealed workspace revision mismatch', async () => {
    const bundle = compileRecommendationEvidenceBundleV1({ ...base, workspaceRevision: 'other-workspace' });
    await expect(invoke(bundle))
      .rejects.toThrow('RECOMMENDATION_EVIDENCE_WORKSPACE_MISMATCH');
  });

  it('rejects malformed/unknown evidence instead of forwarding it', async () => {
    await expect(invoke({ arbitrary: true })).rejects.toThrow();
  });
});
