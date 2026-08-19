import type { QueryAdaptiveCandidate } from '../retrieval/query-adaptive-sampler.js';
import { sampleTangLifecycleLane } from './sample-lane.js';

/**
 * Selects a bounded rerank proposal set. Output remains approximate-only and
 * requires the existing exact-promotion owner before mutation-critical use.
 */
export function selectRerankProposalSet(input: {
  candidates: QueryAdaptiveCandidate[];
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  queryRevision: string;
}) {
  return sampleTangLifecycleLane({
    lane: 'RERANKING',
    candidates: input.candidates,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    featureRevision: input.featureRevision,
    queryRevision: input.queryRevision,
  });
}
