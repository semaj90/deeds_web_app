import {
  decodeKBestViterbi,
  type ViterbiFrame,
  type ViterbiPath,
  type ViterbiTransitionContext,
} from '../../analysis/k-best-viterbi.js';
import type { CandidateFiberV1, CandidateIdentityRef } from '../../retrieval/bounded-resolution.js';

export interface CandidateFiberViterbiValueV1 {
  canonicalId: string;
  identityStatus: CandidateIdentityRef['identityStatus'];
  fiberRevision: string;
}

export interface DecodeCandidateFiberLineageV1Input {
  fibers: readonly CandidateFiberV1[];
  emissionScore: (context: {
    fiber: CandidateFiberV1;
    candidate: CandidateIdentityRef;
    frameIndex: number;
  }) => number;
  transitionScore: (context: ViterbiTransitionContext<CandidateFiberViterbiValueV1>) => number;
  k?: number;
}

export function candidateFibersToViterbiFramesV1(
  fibers: readonly CandidateFiberV1[],
  emissionScore: DecodeCandidateFiberLineageV1Input['emissionScore'],
): ViterbiFrame<CandidateFiberViterbiValueV1>[] {
  return fibers.map((fiber, frameIndex) => ({
    revision: fiber.revision,
    candidates: fiber.candidates.map((candidate) => ({
      id: candidate.canonicalId,
      value: {
        canonicalId: candidate.canonicalId,
        identityStatus: candidate.identityStatus,
        fiberRevision: fiber.revision,
      },
      emissionScore: emissionScore({ fiber, candidate, frameIndex }),
    })),
  }));
}

/**
 * Revision-lineage adapter only. Retrieval owns candidate fibers; the generic
 * Viterbi decoder owns dynamic programming; callers own evidence-based scores.
 */
export function decodeCandidateFiberLineageV1(
  input: DecodeCandidateFiberLineageV1Input,
): ViterbiPath<CandidateFiberViterbiValueV1>[] {
  return decodeKBestViterbi(
    candidateFibersToViterbiFramesV1(input.fibers, input.emissionScore),
    input.transitionScore,
    { k: input.k },
  );
}
