import { rerankWithMarco } from '$lib/server/search/marco-reranker.js';
import type { ClassificationObservationV1 } from './classification-observation-v1.js';

export interface CrossEncoderEscalationCandidateV1 {
  id: string;
  document: string;
  baseScore: number;
  classifierObservations?: readonly ClassificationObservationV1[];
}

export interface CrossEncoderEscalationResultV1 {
  schema: 'atlas.cross-encoder-escalation.v1';
  escalated: boolean;
  reason: 'AMBIGUOUS_CLASSIFICATION' | 'LOW_MARGIN' | 'NOT_REQUIRED' | 'RERANK_FAIL_OPEN';
  candidates: Array<{
    id: string;
    baseScore: number;
    crossEncoderScore: number | null;
    finalScore: number;
  }>;
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
}

function needsEscalation(observations: readonly ClassificationObservationV1[]): boolean {
  if (observations.some((row) => row.abstained)) return true;
  return observations.some((row) => row.normalizedEntropy >= 0.65 || row.confidence < 0.75);
}

export async function escalateAmbiguousCandidatesV1(input: {
  query: string;
  candidates: readonly CrossEncoderEscalationCandidateV1[];
  maxEscalationCandidates?: number;
  crossEncoderWeight?: number;
}): Promise<CrossEncoderEscalationResultV1> {
  const maxEscalationCandidates = Math.max(1, input.maxEscalationCandidates ?? 25);
  const crossEncoderWeight = Math.min(1, Math.max(0, input.crossEncoderWeight ?? 0.7));
  const ranked = [...input.candidates].sort((a, b) => b.baseScore - a.baseScore || a.id.localeCompare(b.id));
  const ambiguous = ranked.filter((row) => needsEscalation(row.classifierObservations ?? [])).slice(0, maxEscalationCandidates);

  if (ambiguous.length === 0) {
    return {
      schema: 'atlas.cross-encoder-escalation.v1',
      escalated: false,
      reason: 'NOT_REQUIRED',
      candidates: ranked.map((row) => ({ id: row.id, baseScore: row.baseScore, crossEncoderScore: null, finalScore: row.baseScore })),
      canonicalWritesAllowed: false,
      retrievalVoteAdded: false,
    };
  }

  const scores = await rerankWithMarco(input.query, ambiguous.map((row) => row.document));
  const valid = scores.length === ambiguous.length && scores.every(Number.isFinite);
  if (!valid) {
    return {
      schema: 'atlas.cross-encoder-escalation.v1',
      escalated: true,
      reason: 'RERANK_FAIL_OPEN',
      candidates: ranked.map((row) => ({ id: row.id, baseScore: row.baseScore, crossEncoderScore: null, finalScore: row.baseScore })),
      canonicalWritesAllowed: false,
      retrievalVoteAdded: false,
    };
  }

  const scoreById = new Map(ambiguous.map((row, index) => [row.id, scores[index]]));
  const out = ranked.map((row) => {
    const crossEncoderScore = scoreById.get(row.id) ?? null;
    const finalScore = crossEncoderScore == null
      ? row.baseScore
      : ((1 - crossEncoderWeight) * row.baseScore) + (crossEncoderWeight * crossEncoderScore);
    return { id: row.id, baseScore: row.baseScore, crossEncoderScore, finalScore };
  }).sort((a, b) => b.finalScore - a.finalScore || a.id.localeCompare(b.id));

  return {
    schema: 'atlas.cross-encoder-escalation.v1',
    escalated: true,
    reason: 'AMBIGUOUS_CLASSIFICATION',
    candidates: out,
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
  };
}
