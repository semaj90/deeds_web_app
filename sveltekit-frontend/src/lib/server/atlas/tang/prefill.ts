import type { QueryAdaptiveCandidate } from '../retrieval/query-adaptive-sampler.js';
import { sampleTangLifecycleLane } from './sample-lane.js';

export interface TangPrefillHint {
  packetKey: string;
  sourceRef: string;
  proposalScore: number;
  sampleRank: number;
  warmCandidate: true;
  requiredForContext: false;
}

/**
 * Produces warming/prioritization hints only. The existing ContextManifest
 * compiler remains the sole prompt-admission owner.
 */
export function buildPrefillHints(input: {
  candidates: QueryAdaptiveCandidate[];
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
  queryRevision: string;
}): { hints: TangPrefillHint[]; sampling: ReturnType<typeof sampleTangLifecycleLane> } {
  const sampling = sampleTangLifecycleLane({
    lane: 'PREFILL',
    candidates: input.candidates,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    featureRevision: input.featureRevision,
    queryRevision: input.queryRevision,
  });

  return {
    sampling,
    hints: sampling.samples.map((sample) => ({
      packetKey: sample.packetKey,
      sourceRef: sample.sourceRef,
      proposalScore: sample.proposalScore,
      sampleRank: sample.sampleRank,
      warmCandidate: true,
      requiredForContext: false,
    })),
  };
}
