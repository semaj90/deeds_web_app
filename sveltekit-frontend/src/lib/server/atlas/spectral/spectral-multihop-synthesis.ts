import type { DagMutationV1, SpectralNodeRowV1 } from './spectral-multihop-contracts.js';

export type LaneUtilityVector = {
  quality: number;
  confidence: number;
  latency: number;
  vram: number;
  cpuIo: number;
  risk: number;
};

export type CandidateSynthesisSignals = {
  semanticAffinity: number;
  latent128Affinity: number;
  latent64Affinity: number;
  spectral4Affinity: number;
  pagerank: number;
  eigenvectorCentrality: number;
  dagGenerationAffinity: number;
  hyperedgeCoverage: number;
  astAffinity: number;
  exactPromotionCost: number;
};

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : 0;

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Number(left[i]) || 0;
    const b = Number(right[i]) || 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp01((dot / Math.sqrt(leftNorm * rightNorm) + 1) / 2);
}

/**
 * S^3-like affinity for normalized topology4 coordinates. q and -q are treated
 * as the same orientation, matching the double-cover property of unit quaternions.
 * This is a topology prior, never a replacement for semantic_768 similarity.
 */
export function topology4Affinity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== 4 || right.length !== 4) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = Number(left[i]) || 0;
    const b = Number(right[i]) || 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp01(Math.abs(dot / Math.sqrt(leftNorm * rightNorm)));
}

/**
 * Harmonizes independent evidence without turning algorithms into extra lanes.
 * Geometric mean penalizes a candidate that is strong in one family and absent
 * in the others, while the arithmetic term keeps partial but useful evidence alive.
 */
export function harmonyScore(signals: CandidateSynthesisSignals): number {
  const semantic = clamp01(0.55 * signals.semanticAffinity
    + 0.25 * signals.latent128Affinity
    + 0.20 * signals.latent64Affinity);
  const structural = clamp01(0.28 * signals.pagerank
    + 0.24 * signals.eigenvectorCentrality
    + 0.18 * signals.spectral4Affinity
    + 0.15 * signals.dagGenerationAffinity
    + 0.15 * signals.astAffinity);
  const relational = clamp01(signals.hyperedgeCoverage);

  const epsilon = 1e-6;
  const geometric = Math.cbrt(
    Math.max(epsilon, semantic)
    * Math.max(epsilon, structural)
    * Math.max(epsilon, relational),
  );
  const arithmetic = (semantic + structural + relational) / 3;
  const costPenalty = 0.15 * clamp01(signals.exactPromotionCost);
  return clamp01(0.65 * geometric + 0.35 * arithmetic - costPenalty);
}

export function resourceAdjustedUtility(
  lane: LaneUtilityVector,
  weights: { latency: number; vram: number; cpuIo: number; risk: number },
): number {
  return clamp01(
    0.60 * clamp01(lane.quality)
      + 0.40 * clamp01(lane.confidence)
      - weights.latency * clamp01(lane.latency)
      - weights.vram * clamp01(lane.vram)
      - weights.cpuIo * clamp01(lane.cpuIo)
      - weights.risk * clamp01(lane.risk),
  );
}

export function selectBoundedMutations(input: {
  mutations: readonly DagMutationV1[];
  maxMutations: number;
  remainingVramBytes: number;
  maxRisk: number;
}): DagMutationV1[] {
  let remaining = Math.max(0, input.remainingVramBytes);
  const ranked = [...input.mutations]
    .filter((mutation) => mutation.mutationRisk <= input.maxRisk)
    .sort((a, b) => {
      const utilityA = a.expectedQualityGain / (1 + a.estimatedLatencyMs / 1000 + a.mutationRisk);
      const utilityB = b.expectedQualityGain / (1 + b.estimatedLatencyMs / 1000 + b.mutationRisk);
      return utilityB - utilityA || a.mutationId.localeCompare(b.mutationId);
    });

  const selected: DagMutationV1[] = [];
  for (const mutation of ranked) {
    if (selected.length >= Math.max(0, input.maxMutations)) break;
    if (mutation.estimatedVramBytes > remaining) continue;
    selected.push(mutation);
    remaining -= mutation.estimatedVramBytes;
  }
  return selected;
}

export function generationAffinity(left: SpectralNodeRowV1, right: SpectralNodeRowV1): number {
  if (left.generation === null || right.generation === null) return 0;
  const delta = Math.abs(left.generation - right.generation);
  return 1 / (1 + delta);
}
