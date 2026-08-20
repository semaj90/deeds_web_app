import {
  CandidateFeatureMatrixV1Schema,
  QueryRoutingSnapshotV1Schema,
  ROUTING_FEATURE_NAMES,
  ToolRoutingReceiptV1Schema,
  type CandidateFeatureMatrixV1,
  type DeterministicQueryFeaturesV1,
  type QueryRoutingSnapshotV1,
  type RetrievalSignalVectorV1,
  type ToolCandidateSignalV1,
  type ToolRoutingReceiptV1,
  stableRoutingChecksum,
} from './contracts.js';
import type { ResourceEnvelopeV1, ResolutionRevisionSet } from '$lib/server/retrieval/bounded-resolution.js';

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeCost(value: number, denominator: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / Math.max(1, denominator));
}

export function buildCandidateFeatureMatrix(
  candidates: readonly ToolCandidateSignalV1[],
  envelope: ResourceEnvelopeV1,
): CandidateFeatureMatrixV1 {
  const rows = [...candidates]
    .sort((a, b) => a.toolId.localeCompare(b.toolId))
    .map((candidate) => ({
      toolId: candidate.toolId,
      eligible: candidate.eligible,
      values: [
        candidate.signals.lexicalExact,
        candidate.signals.lexicalSparse,
        candidate.signals.semantic,
        candidate.signals.ast,
        candidate.signals.graph,
        candidate.signals.hyperedge,
        candidate.intentProbability,
        candidate.domainProbability,
        candidate.capabilityMatch,
        candidate.hammingMaskMatch,
        candidate.historicalSuccessRate,
        candidate.historicalFailureRate,
        candidate.evidenceCoverage,
        candidate.revisionFreshness,
        normalizeCost(candidate.estimatedLatencyMs, envelope.maxWallMs),
        envelope.maxVramBytes > 0 ? normalizeCost(candidate.estimatedVramBytes, envelope.maxVramBytes) : 0,
        candidate.requiresWrite ? 1 : 0,
        candidate.requiresApproval ? 1 : 0,
      ],
      evidenceRefs: sortedUnique(candidate.evidenceRefs),
    }));

  const payload = {
    schemaVersion: 'atlas.candidate-feature-matrix.v1' as const,
    featureNames: [...ROUTING_FEATURE_NAMES],
    rows,
  };

  return CandidateFeatureMatrixV1Schema.parse({
    ...payload,
    checksum: stableRoutingChecksum(payload),
  });
}

export function buildQueryRoutingSnapshot(input: {
  requestId: string;
  revisions: ResolutionRevisionSet;
  toolRegistryRevision: string;
  queryText: string;
  deterministicFeatures: DeterministicQueryFeaturesV1;
  retrievalSignals: RetrievalSignalVectorV1;
  candidateTools: ToolCandidateSignalV1[];
  resourceEnvelope: ResourceEnvelopeV1;
}): QueryRoutingSnapshotV1 {
  const deterministicFeatures = {
    ...input.deterministicFeatures,
    identifiers: sortedUnique(input.deterministicFeatures.identifiers),
    filePaths: sortedUnique(input.deterministicFeatures.filePaths),
    symbols: sortedUnique(input.deterministicFeatures.symbols),
    errorCodes: sortedUnique(input.deterministicFeatures.errorCodes),
    languages: sortedUnique(input.deterministicFeatures.languages),
    astKinds: sortedUnique(input.deterministicFeatures.astKinds),
    requestedActions: [...new Set(input.deterministicFeatures.requestedActions)].sort(),
    negations: sortedUnique(input.deterministicFeatures.negations),
    temporalTerms: sortedUnique(input.deterministicFeatures.temporalTerms),
    activeFileIds: sortedUnique(input.deterministicFeatures.activeFileIds),
  };
  const candidateTools = [...input.candidateTools]
    .map((candidate) => ({ ...candidate, evidenceRefs: sortedUnique(candidate.evidenceRefs) }))
    .sort((a, b) => a.toolId.localeCompare(b.toolId));
  const candidateFeatureMatrix = buildCandidateFeatureMatrix(candidateTools, input.resourceEnvelope);

  const payload = {
    schemaVersion: 'atlas.query-routing-snapshot.v1' as const,
    requestId: input.requestId,
    revisions: input.revisions,
    toolRegistryRevision: input.toolRegistryRevision,
    queryText: input.queryText,
    deterministicFeatures,
    retrievalSignals: input.retrievalSignals,
    candidateTools,
    candidateFeatureMatrix,
    resourceEnvelope: input.resourceEnvelope,
  };

  return QueryRoutingSnapshotV1Schema.parse({ ...payload, checksum: stableRoutingChecksum(payload) });
}

export function deterministicToolScore(candidate: ToolCandidateSignalV1, envelope: ResourceEnvelopeV1): number {
  if (!candidate.eligible) return Number.NEGATIVE_INFINITY;

  const positive =
    0.12 * candidate.signals.lexicalExact +
    0.08 * candidate.signals.lexicalSparse +
    0.12 * candidate.signals.semantic +
    0.08 * candidate.signals.ast +
    0.08 * candidate.signals.graph +
    0.05 * candidate.signals.hyperedge +
    0.12 * candidate.intentProbability +
    0.08 * candidate.domainProbability +
    0.08 * candidate.capabilityMatch +
    0.04 * candidate.hammingMaskMatch +
    0.07 * candidate.historicalSuccessRate +
    0.04 * candidate.evidenceCoverage +
    0.02 * candidate.revisionFreshness;

  const penalty =
    0.04 * candidate.historicalFailureRate +
    0.02 * normalizeCost(candidate.estimatedLatencyMs, envelope.maxWallMs) +
    0.02 * (envelope.maxVramBytes > 0 ? normalizeCost(candidate.estimatedVramBytes, envelope.maxVramBytes) : 0);

  return positive - penalty;
}

export function buildToolRoutingReceipt(input: {
  snapshot: QueryRoutingSnapshotV1;
  topK: number;
  neuralScores?: Readonly<Record<string, number>>;
  neuralWeight?: number;
}): ToolRoutingReceiptV1 {
  const neuralWeight = Math.min(0.5, Math.max(0, input.neuralWeight ?? 0.25));
  const scored = input.snapshot.candidateTools
    .filter((candidate) => candidate.eligible)
    .map((candidate) => {
      const baselineScore = deterministicToolScore(candidate, input.snapshot.resourceEnvelope);
      const rawNeural = input.neuralScores?.[candidate.toolId];
      const neuralScore = Number.isFinite(rawNeural) ? Math.min(1, Math.max(0, rawNeural!)) : null;
      const finalScore = neuralScore == null
        ? baselineScore
        : (1 - neuralWeight) * baselineScore + neuralWeight * neuralScore;
      return { toolId: candidate.toolId, baselineScore, neuralScore, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore || a.toolId.localeCompare(b.toolId));

  const topK = Math.max(1, Math.min(Math.floor(input.topK), scored.length || 1));
  const rankedTools = scored.map((row, index) => ({ ...row, rank: index + 1 }));
  const selectedToolIds = rankedTools.slice(0, topK).map((row) => row.toolId);
  const allowedToolIds = rankedTools.map((row) => row.toolId);
  const excludedToolIds = input.snapshot.candidateTools.filter((candidate) => !candidate.eligible).map((candidate) => candidate.toolId).sort();

  const payload = {
    schemaVersion: 'atlas.tool-routing-receipt.v1' as const,
    requestId: input.snapshot.requestId,
    snapshotChecksum: input.snapshot.checksum,
    routingMode: input.neuralScores ? 'hybrid' as const : 'deterministic' as const,
    allowedToolIds,
    excludedToolIds,
    rankedTools,
    selectedToolIds,
    topK,
    reasonCodes: [
      'FSM_AND_CAPABILITY_MASK_APPLIED_BEFORE_RANKING',
      input.neuralScores ? 'NEURAL_SCORE_BOUNDED_AS_CHALLENGER' : 'DETERMINISTIC_BASELINE_ONLY',
      'LLM_NOT_USED_FOR_CANONICAL_ROUTING',
    ],
  };

  return ToolRoutingReceiptV1Schema.parse({ ...payload, checksum: stableRoutingChecksum(payload) });
}
