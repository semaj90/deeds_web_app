import type {
  QasCandidateFeatureV1,
  QasSampledCandidateV1,
  QasSamplingReceiptV1
} from './contracts';

export interface QasSamplerWeights {
  semantic: number;
  graph: number;
  domain: number;
  process: number;
  execution: number;
}

export interface QasSamplerOptions {
  requestId: string;
  policyRevision: string;
  featureRevision: string;
  seed: number;
  budget: number;
  weights: QasSamplerWeights;
  epsilon?: number;
}

const clamp01 = (value: number | undefined): number =>
  value == null || !Number.isFinite(value) ? 0 : Math.min(1, Math.max(0, value));

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

function numericFeatureVector(row: QasCandidateFeatureV1): number[] {
  return [
    row.semanticAffinity,
    row.lexicalAffinity,
    row.graphAffinity,
    row.astAffinity,
    row.processAffinity,
    row.domainAffinity,
    row.executionPrior,
    row.reuseProbability,
    row.recency,
    row.memoryCost == null ? undefined : 1 / (1 + Math.max(0, row.memoryCost)),
    row.promotionCost == null ? undefined : 1 / (1 + Math.max(0, row.promotionCost))
  ].map(clamp01);
}

export function proposalWeight(
  row: QasCandidateFeatureV1,
  weights: QasSamplerWeights,
  epsilon = 1e-9
): number {
  const x = numericFeatureVector(row);
  const norm2 = x.reduce((sum, value) => sum + value * value, 0);

  const affinity = sigmoid(
    weights.semantic * clamp01(row.semanticAffinity) +
    weights.graph * clamp01(row.graphAffinity) +
    weights.domain * clamp01(row.domainAffinity) +
    weights.process * clamp01(row.processAffinity) +
    weights.execution * clamp01(row.executionPrior)
  );

  return Math.max(epsilon, norm2 * Math.max(affinity, epsilon));
}

// Mulberry32: deterministic and adequate for reproducible shadow sampling.
// Not intended for security.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Efraimidis-Spirakis weighted sampling without replacement.
// This is a practical shadow sampler inspired by length-squared selection;
// it is not presented as an implementation of Tang's theorem.
export function sampleQueryConditionedCandidates(
  rows: QasCandidateFeatureV1[],
  options: QasSamplerOptions
): QasSamplingReceiptV1 {
  const epsilon = options.epsilon ?? 1e-9;
  const budget = Math.max(0, Math.min(options.budget, rows.length));
  const rng = mulberry32(options.seed);

  const weighted = rows.map((row) => ({
    row,
    weight: proposalWeight(row, options.weights, epsilon)
  }));

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

  const ranked = weighted
    .map((item) => {
      const u = Math.max(epsilon, rng());
      // Larger key wins.
      const key = Math.pow(u, 1 / Math.max(item.weight, epsilon));
      return { ...item, key };
    })
    .sort((a, b) => b.key - a.key);

  const selected = new Set(ranked.slice(0, budget).map((item) => item.row.canonicalId));

  const candidates: QasSampledCandidateV1[] = weighted.map(({ row, weight }) => ({
    canonicalId: row.canonicalId,
    proposalWeight: weight,
    proposalProbability: totalWeight > 0 ? weight / totalWeight : 0,
    sampled: selected.has(row.canonicalId),
    evidenceState: 'APPROXIMATE_ONLY'
  }));

  return {
    schema: 'parent-atlas.qas.sampling-receipt.v1',
    requestId: options.requestId,
    policyRevision: options.policyRevision,
    featureRevision: options.featureRevision,
    seed: options.seed,
    baselineCount: rows.length,
    sampleBudget: budget,
    sampledCount: selected.size,
    candidates
  };
}

export function markExactPromotion(
  receipt: QasSamplingReceiptV1,
  promotedCanonicalIds: ReadonlySet<string>
): QasSamplingReceiptV1 {
  return {
    ...receipt,
    candidates: receipt.candidates.map((candidate) => ({
      ...candidate,
      evidenceState: promotedCanonicalIds.has(candidate.canonicalId)
        ? 'EXACT_PROMOTED'
        : candidate.sampled
          ? 'REJECTED'
          : 'APPROXIMATE_ONLY'
    }))
  };
}
