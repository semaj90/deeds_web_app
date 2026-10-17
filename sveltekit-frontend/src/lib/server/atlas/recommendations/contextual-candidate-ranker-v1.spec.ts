import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import { buildSearchRuntimeSelectedCandidateSetV1 } from '../retrieval/search-runtime-selected-candidate-set-v1.js';
import {
  recommendContextualCandidatesV1,
  verifyContextualCandidateRecommendationReceiptV1,
} from './contextual-candidate-ranker-v1.js';

const WORKSPACE = `sha256:${'e'.repeat(64)}`;
const SOURCE = `sha256:${'a'.repeat(64)}`;

function fixture(input: { featureRows?: Array<Partial<CandidateFeatureRowV1>> } = {}) {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidates: [0, 1, 2, 3, 4].map((index) => ({
      canonicalId: `packet:${index}`,
      packetKey: `packet:${index}`,
      sourceRef: `src/${index}.ts`,
      treeNodeId: null,
      symbolVersionId: null,
      graphRevision: 'graph:r1',
      semanticRevision: 'semantic:r1',
      workspaceRevision: WORKSPACE,
      sourceRevision: SOURCE,
    })),
    candidateSnapshotRevision: 'snapshot:r1',
    workspaceRevision: WORKSPACE,
    producerRevision: 'ordinal:r1',
  });
  const selection = buildSearchRuntimeSelectedCandidateSetV1({
    ordinalMap,
    requestId: 'request:r1',
    queryDigest: '1'.repeat(64),
    retrievalPolicyRevision: 'search-policy:r1',
    selectedCandidates: ordinalMap.candidates.map((candidate) => ({
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey!,
      sourceRef: candidate.sourceRef!,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      score: 1 - candidate.candidateOrdinal / 10,
      evidenceRefs: [`evidence:${candidate.candidateOrdinal}`],
    })),
  });
  const defaults = ordinalMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'features:r1',
    laneMask: ['semantic'] as ('semantic')[],
    evidenceRefs: [`feature:${candidate.candidateOrdinal}`],
    semanticRelevance: 0.2 + candidate.candidateOrdinal / 10,
    lexicalRelevance: 0.5,
    astAffinity: null,
    graphAuthority: null,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: null,
    memoryUtility: null,
  }));
  const rows = defaults.map((row, index) => ({ ...row, ...(input.featureRows?.[index] ?? {}) }));
  const featureSnapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:r1',
    producerRevision: 'feature-owner:r1',
    rows,
  });
  return { ordinalMap, selection, featureSnapshot };
}

describe('contextual candidate ranker', () => {
  it('ranks only selected, revision-bound candidates and caps output at four', () => {
    const result = recommendContextualCandidatesV1(fixture());
    expect(result.recommendations).toHaveLength(4);
    expect(result.recommendations.map((candidate) => candidate.candidateOrdinal)).toEqual([4, 3, 2, 1]);
    expect(result.recommendations[0]?.evidenceRefs).toEqual(['evidence:4']);
    expect(result.status).toBe('ADVISORY');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.retrievalVoteAdded).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(() => verifyContextualCandidateRecommendationReceiptV1(result)).not.toThrow();
    expect(() => verifyContextualCandidateRecommendationReceiptV1({ ...result, requestId: 'tampered' }))
      .toThrow('CONTEXTUAL_RECOMMENDATION_RECEIPT_CHECKSUM_MISMATCH');
  });

  it('abstains when rows contain no supported normalized signals', () => {
    const state = fixture({ featureRows: [0, 1, 2, 3, 4].map(() => ({ semanticRelevance: null, lexicalRelevance: null })) });
    const result = recommendContextualCandidatesV1(state);
    expect(result.recommendations).toEqual([]);
    expect(result.status).toBe('ABSTAIN');
    expect(result.abstained).toBe(true);
  });

  it('fails closed on selection/feature revision mismatch and invalid limits', () => {
    const state = fixture();
    expect(() => recommendContextualCandidatesV1({ ...state, maxRecommendations: 5 })).toThrow('CONTEXTUAL_RECOMMENDATION_LIMIT_INVALID');
    expect(() => recommendContextualCandidatesV1({
      ...state,
      featureSnapshot: { ...state.featureSnapshot, workspaceRevision: `sha256:${'f'.repeat(64)}` },
    })).toThrow('SELECTED_FEATURE_SNAPSHOT_PARENT_BINDING_MISMATCH');
  });
});
