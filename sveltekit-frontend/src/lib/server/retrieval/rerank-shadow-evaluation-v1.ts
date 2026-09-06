import { createHash } from 'node:crypto';

export const RERANK_SHADOW_COMPARISON_V1_SCHEMA = 'atlas.rerank-shadow-comparison.v1' as const;
export const RERANK_SHADOW_MAX_CANDIDATES = 12;

export interface RerankShadowCandidateV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  /** Optional reviewed relevance grade. Required for NDCG/MRR metrics. */
  relevanceGrade?: number;
}

export interface RerankShadowArmV1 {
  armId: string;
  modelRevision: string;
  orderedCandidateIds: readonly string[];
  latencyMs?: number;
  tokenCount?: number;
  gpuMemoryBytes?: number;
  failed?: boolean;
}

export interface RerankShadowComparisonInputV1 {
  requestId: string;
  candidateSnapshotRevision: string;
  candidates: readonly RerankShadowCandidateV1[];
  servedCandidateIds: readonly string[];
  baseline: RerankShadowArmV1;
  challenger: RerankShadowArmV1;
}

export interface RerankShadowRankingMetricsV1 {
  ndcgAt10: number | null;
  mrrAt10: number | null;
  top1CandidateId: string | null;
}

export interface RerankShadowComparisonReceiptV1 {
  schema: typeof RERANK_SHADOW_COMPARISON_V1_SCHEMA;
  requestId: string;
  candidateSnapshotRevision: string;
  candidateCount: number;
  candidateSetChecksum: string;
  servedOrderChecksum: string;
  baselineOrderChecksum: string;
  challengerOrderChecksum: string;
  servedOrderIntegrityOk: boolean;
  candidateSetIntegrityOk: boolean;
  identityIntegrityOk: boolean;
  promotionVerdict: null;
  metrics: {
    labelsAvailable: boolean;
    baseline: RerankShadowRankingMetricsV1;
    challenger: RerankShadowRankingMetricsV1;
    top1Agreement: boolean | null;
    topKOverlapAt10: number;
    meanAbsoluteRankDisplacement: number;
    maxAbsoluteRankDisplacement: number;
  };
  resource: {
    baselineFailed: boolean;
    challengerFailed: boolean;
    baselineLatencyMs: number | null;
    challengerLatencyMs: number | null;
    latencyDeltaMs: number | null;
    baselineTokenCount: number | null;
    challengerTokenCount: number | null;
    baselineGpuMemoryBytes: number | null;
    challengerGpuMemoryBytes: number | null;
  };
  status: 'SHADOW_COMPARISON_PROVEN';
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`RERANK_SHADOW_${field.toUpperCase()}_REQUIRED`);
  return normalized;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`RERANK_SHADOW_${field.toUpperCase()}_NON_FINITE`);
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

function orderChecksum(ids: readonly string[]): string {
  return checksum(ids);
}

function validateCandidates(candidates: readonly RerankShadowCandidateV1[]): void {
  if (candidates.length === 0) throw new Error('RERANK_SHADOW_CANDIDATES_REQUIRED');
  if (candidates.length > RERANK_SHADOW_MAX_CANDIDATES) {
    throw new Error(`RERANK_SHADOW_CANDIDATE_LIMIT_EXCEEDED:${candidates.length}`);
  }

  const ordinals = new Set<number>();
  const canonicalIds = new Set<string>();
  const packetKeys = new Set<string>();
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.candidateOrdinal) || candidate.candidateOrdinal < 0) {
      throw new Error('RERANK_SHADOW_CANDIDATE_ORDINAL_INVALID');
    }
    if (ordinals.has(candidate.candidateOrdinal)) throw new Error('RERANK_SHADOW_DUPLICATE_ORDINAL');
    ordinals.add(candidate.candidateOrdinal);

    const canonicalId = requireNonEmpty(candidate.canonicalId, 'canonical_id');
    const packetKey = requireNonEmpty(candidate.packetKey, 'packet_key');
    requireNonEmpty(candidate.sourceRef, 'source_ref');
    requireNonEmpty(candidate.sourceRevision, 'source_revision');
    if (canonicalIds.has(canonicalId)) throw new Error('RERANK_SHADOW_DUPLICATE_CANONICAL_ID');
    if (packetKeys.has(packetKey)) throw new Error('RERANK_SHADOW_DUPLICATE_PACKET_KEY');
    canonicalIds.add(canonicalId);
    packetKeys.add(packetKey);

    if (candidate.relevanceGrade !== undefined) {
      const grade = requireFinite(candidate.relevanceGrade, 'relevance_grade');
      if (!Number.isInteger(grade) || grade < 0) throw new Error('RERANK_SHADOW_RELEVANCE_GRADE_INVALID');
    }
  }
}

function validateOrder(
  name: string,
  ids: readonly string[],
  candidateIds: ReadonlySet<string>,
): void {
  if (ids.length !== candidateIds.size) throw new Error(`RERANK_SHADOW_${name}_COUNT_MISMATCH`);
  const seen = new Set<string>();
  for (const id of ids) {
    const normalized = requireNonEmpty(id, `${name.toLowerCase()}_candidate_id`);
    if (!candidateIds.has(normalized)) throw new Error(`RERANK_SHADOW_${name}_UNKNOWN_CANDIDATE`);
    if (seen.has(normalized)) throw new Error(`RERANK_SHADOW_${name}_DUPLICATE_CANDIDATE`);
    seen.add(normalized);
  }
}

function topKOverlap(left: readonly string[], right: readonly string[], k: number): number {
  const leftTop = new Set(left.slice(0, k));
  const rightTop = new Set(right.slice(0, k));
  const denominator = Math.min(k, left.length, right.length);
  if (denominator === 0) return 1;
  let overlap = 0;
  for (const id of leftTop) if (rightTop.has(id)) overlap += 1;
  return overlap / denominator;
}

function rankingMetrics(
  order: readonly string[],
  candidatesById: ReadonlyMap<string, RerankShadowCandidateV1>,
): RerankShadowRankingMetricsV1 {
  const labelsAvailable = order.every((id) => candidatesById.get(id)?.relevanceGrade !== undefined);
  if (!labelsAvailable) return { ndcgAt10: null, mrrAt10: null, top1CandidateId: order[0] ?? null };

  const top = order.slice(0, 10);
  const gains = top.map((id) => candidatesById.get(id)!.relevanceGrade!);
  const ideal = [...candidatesById.values()]
    .map((candidate) => candidate.relevanceGrade!)
    .sort((a, b) => b - a)
    .slice(0, 10);
  const dcg = gains.reduce((sum, gain, index) => sum + ((2 ** gain) - 1) / Math.log2(index + 2), 0);
  const idcg = ideal.reduce((sum, gain, index) => sum + ((2 ** gain) - 1) / Math.log2(index + 2), 0);
  const firstRelevant = gains.findIndex((gain) => gain > 0);
  return {
    ndcgAt10: idcg === 0 ? 0 : dcg / idcg,
    mrrAt10: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
    top1CandidateId: order[0] ?? null,
  };
}

function rankDisplacement(left: readonly string[], right: readonly string[]): {
  mean: number;
  max: number;
} {
  const leftRanks = new Map(left.map((id, index) => [id, index]));
  const distances = right.map((id, index) => Math.abs((leftRanks.get(id) ?? index) - index));
  return {
    mean: distances.reduce((sum, distance) => sum + distance, 0) / distances.length,
    max: Math.max(...distances),
  };
}

function optionalFinite(value: number | undefined, field: string): number | null {
  return value === undefined ? null : requireFinite(value, field);
}

export function compareRerankShadowV1(
  input: RerankShadowComparisonInputV1,
): RerankShadowComparisonReceiptV1 {
  requireNonEmpty(input.requestId, 'request_id');
  requireNonEmpty(input.candidateSnapshotRevision, 'candidate_snapshot_revision');
  validateCandidates(input.candidates);

  const candidatesById = new Map(input.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const candidateIds = new Set(candidatesById.keys());
  validateOrder('SERVED', input.servedCandidateIds, candidateIds);
  validateOrder('BASELINE', input.baseline.orderedCandidateIds, candidateIds);
  validateOrder('CHALLENGER', input.challenger.orderedCandidateIds, candidateIds);
  requireNonEmpty(input.baseline.armId, 'baseline_arm_id');
  requireNonEmpty(input.baseline.modelRevision, 'baseline_model_revision');
  requireNonEmpty(input.challenger.armId, 'challenger_arm_id');
  requireNonEmpty(input.challenger.modelRevision, 'challenger_model_revision');

  const sortedIdentity = [...input.candidates]
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal)
    .map(({ candidateOrdinal, canonicalId, packetKey, sourceRef, sourceRevision }) => ({
      candidateOrdinal,
      canonicalId,
      packetKey,
      sourceRef,
      sourceRevision,
    }));
  const candidateSetChecksum = checksum(sortedIdentity);
  const servedOrderIntegrityOk = input.servedCandidateIds.every(
    (id, index) => id === input.baseline.orderedCandidateIds[index],
  );
  const rankDelta = rankDisplacement(input.baseline.orderedCandidateIds, input.challenger.orderedCandidateIds);
  const baselineMetrics = rankingMetrics(input.baseline.orderedCandidateIds, candidatesById);
  const challengerMetrics = rankingMetrics(input.challenger.orderedCandidateIds, candidatesById);
  const labelsAvailable = baselineMetrics.ndcgAt10 !== null && challengerMetrics.ndcgAt10 !== null;
  const baselineLatencyMs = optionalFinite(input.baseline.latencyMs, 'baseline_latency_ms');
  const challengerLatencyMs = optionalFinite(input.challenger.latencyMs, 'challenger_latency_ms');

  return {
    schema: RERANK_SHADOW_COMPARISON_V1_SCHEMA,
    requestId: input.requestId,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    candidateCount: input.candidates.length,
    candidateSetChecksum,
    servedOrderChecksum: orderChecksum(input.servedCandidateIds),
    baselineOrderChecksum: orderChecksum(input.baseline.orderedCandidateIds),
    challengerOrderChecksum: orderChecksum(input.challenger.orderedCandidateIds),
    servedOrderIntegrityOk,
    candidateSetIntegrityOk: true,
    identityIntegrityOk: true,
    promotionVerdict: null,
    metrics: {
      labelsAvailable,
      baseline: baselineMetrics,
      challenger: challengerMetrics,
      top1Agreement: baselineMetrics.top1CandidateId === challengerMetrics.top1CandidateId,
      topKOverlapAt10: topKOverlap(input.baseline.orderedCandidateIds, input.challenger.orderedCandidateIds, 10),
      meanAbsoluteRankDisplacement: rankDelta.mean,
      maxAbsoluteRankDisplacement: rankDelta.max,
    },
    resource: {
      baselineFailed: input.baseline.failed === true,
      challengerFailed: input.challenger.failed === true,
      baselineLatencyMs,
      challengerLatencyMs,
      latencyDeltaMs: baselineLatencyMs === null || challengerLatencyMs === null
        ? null
        : challengerLatencyMs - baselineLatencyMs,
      baselineTokenCount: optionalFinite(input.baseline.tokenCount, 'baseline_token_count'),
      challengerTokenCount: optionalFinite(input.challenger.tokenCount, 'challenger_token_count'),
      baselineGpuMemoryBytes: optionalFinite(input.baseline.gpuMemoryBytes, 'baseline_gpu_memory_bytes'),
      challengerGpuMemoryBytes: optionalFinite(input.challenger.gpuMemoryBytes, 'challenger_gpu_memory_bytes'),
    },
    status: 'SHADOW_COMPARISON_PROVEN',
  };
}
