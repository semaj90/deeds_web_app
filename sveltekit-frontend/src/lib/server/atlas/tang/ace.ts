import type { QueryAdaptiveCandidate } from '../retrieval/query-adaptive-sampler.js';
import { sampleTangLifecycleLane } from './sample-lane.js';

export interface AceResidencyHint {
  packetKey: string;
  sourceRef: string;
  proposalScore: number;
  hotCandidate: boolean;
  canonicalMemory: false;
}

/**
 * Produces hot-residency hints for ACE/BitFrost. Cache residence remains a cost
 * optimization and must never increase semantic relevance or ContextManifest score.
 */
export function buildAceResidencyHints(input: {
  candidates: QueryAdaptiveCandidate[];
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  queryRevision: string;
}) {
  const sampling = sampleTangLifecycleLane({
    lane: 'ACE',
    candidates: input.candidates,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    featureRevision: input.featureRevision,
    queryRevision: input.queryRevision,
  });
  return {
    sampling,
    hints: sampling.samples.map((sample, index): AceResidencyHint => ({
      packetKey: sample.packetKey,
      sourceRef: sample.sourceRef,
      proposalScore: sample.proposalScore,
      hotCandidate: index < Math.ceil(sampling.samples.length * 0.75),
      canonicalMemory: false,
    })),
  };
}
