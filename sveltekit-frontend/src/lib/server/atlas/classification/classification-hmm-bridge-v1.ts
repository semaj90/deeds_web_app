import type { ClassificationObservationV1 } from './classification-observation-v1.js';
import type { SequenceObservation } from '$lib/server/analysis/sequence-model-contract.js';

export interface ClassificationHmmBridgeResultV1 {
  schema: 'atlas.classification-hmm-bridge.v1';
  sequenceId: string;
  observations: SequenceObservation[];
  sourceObservationIds: string[];
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
}

/**
 * Converts classifier probabilities into weighted sequence observations for the
 * existing HMM/Viterbi service. This does not alter the HMM transition/emission
 * matrices and therefore cannot silently retrain or promote the sequence model.
 */
export function classificationObservationsToHmmV1(input: {
  sequenceId: string;
  classifications: readonly ClassificationObservationV1[];
  startPosition?: number;
  minProbability?: number;
}): ClassificationHmmBridgeResultV1 {
  const start = input.startPosition ?? 0;
  const minProbability = input.minProbability ?? 0.15;
  const observations: SequenceObservation[] = [];
  let position = start;

  for (const classification of input.classifications) {
    for (const label of classification.labels) {
      if (label.probability < minProbability) continue;
      observations.push({
        sequenceId: input.sequenceId,
        position: position++,
        observation: `${classification.task}:${label.label}`,
        weight: classification.abstained ? label.probability * 0.5 : label.probability,
        sourceRef: classification.sourceRef ?? null,
      });
    }
    if (classification.abstained) {
      observations.push({
        sequenceId: input.sequenceId,
        position: position++,
        observation: `${classification.task}:ABSTAINED`,
        weight: Math.max(0.1, 1 - classification.confidence),
        sourceRef: classification.sourceRef ?? null,
      });
    }
  }

  return {
    schema: 'atlas.classification-hmm-bridge.v1',
    sequenceId: input.sequenceId,
    observations,
    sourceObservationIds: [...new Set(input.classifications.map((row) => row.observationId))].sort(),
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
  };
}
