import type { PageRankAuthorityLike } from '../../topology/pagerank-authority.js';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import { buildFeatureRowV1, type FeatureRowV1 } from '../ranking/feature-row-v1.js';

export interface PromoteCandidateFeatureRowV1Input {
  candidate: CandidateFeatureRowV1;
  locator: EvidenceLocatorV1;
  pagerank: PageRankAuthorityLike;
  rrf: number;
  freshness: number;
}

/**
 * Promotion boundary between the nullable/raw candidate feature envelope and the
 * normalized FeatureRowV1 used by ranking/eval. The adapter never invents
 * canonical identity, revisions, PageRank provenance, or cross-encoder scores.
 */
export function promoteCandidateFeatureRowV1(input: PromoteCandidateFeatureRowV1Input): FeatureRowV1 {
  const { candidate, locator } = input;
  if (candidate.canonicalId !== locator.canonicalId) {
    throw new Error(`CANDIDATE_FEATURE_CANONICAL_ID_MISMATCH:${candidate.canonicalId}:${locator.canonicalId}`);
  }
  if (candidate.packetKey !== null && candidate.packetKey !== locator.packetKey) {
    throw new Error(`CANDIDATE_FEATURE_PACKET_KEY_MISMATCH:${candidate.packetKey}:${locator.packetKey ?? ''}`);
  }
  if (candidate.workspaceRevision !== locator.workspaceRevision) {
    throw new Error('CANDIDATE_FEATURE_REVISION_MISMATCH:workspace');
  }
  if (candidate.sourceRevision !== locator.sourceRevision) {
    throw new Error('CANDIDATE_FEATURE_REVISION_MISMATCH:source');
  }
  if (candidate.graphRevision === null) throw new Error('CANDIDATE_FEATURE_GRAPH_REVISION_REQUIRED');
  if (candidate.semanticRevision === null) throw new Error('CANDIDATE_FEATURE_SEMANTIC_REVISION_REQUIRED');
  if (candidate.crossEncoderAvailable && candidate.crossEncoderCalibratedScore === null) {
    throw new Error('CANDIDATE_FEATURE_CALIBRATED_CROSS_ENCODER_REQUIRED');
  }

  return buildFeatureRowV1({
    locator,
    featureRevision: candidate.featureRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    dense: candidate.semanticRelevance ?? 0,
    sparse: candidate.lexicalRelevance ?? 0,
    rrf: input.rrf,
    ast: candidate.astAffinity ?? 0,
    pagerank: input.pagerank,
    pprAffinity: candidate.personalizedPageRank,
    domainAffinity: candidate.domainAffinity ?? 0,
    freshness: input.freshness,
    crossEncoder: candidate.crossEncoderAvailable ? candidate.crossEncoderCalibratedScore : null,
    executionUtility: candidate.executionUtility ?? 0,
    evidenceRefs: candidate.evidenceRefs,
  });
}
