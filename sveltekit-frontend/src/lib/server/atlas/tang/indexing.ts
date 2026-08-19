import type { QueryAdaptiveCandidate } from '../retrieval/query-adaptive-sampler.js';
import { sampleTangLifecycleLane } from './sample-lane.js';

/**
 * Prioritizes expensive enrichment/index-maintenance work after canonical source
 * ingestion. Never drops source truth and never decides canonical identity.
 */
export function prioritizeIndexingEnrichment(input: {
  candidates: QueryAdaptiveCandidate[];
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  sourceRevision: string;
}) {
  return sampleTangLifecycleLane({
    lane: 'INDEXING',
    candidates: input.candidates,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    featureRevision: input.featureRevision,
    queryRevision: `index:${input.sourceRevision}`,
  });
}
