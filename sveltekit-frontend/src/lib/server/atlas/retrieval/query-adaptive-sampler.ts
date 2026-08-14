import { createHash } from 'node:crypto';

export const QAS_CORE_FEATURE_NAMES = [
  'semanticAffinity',
  'lexicalAffinity',
  'graphAuthority',
  'astAffinity',
  'processAffinity',
  'domainAffinity',
  'priorExecutionSuccess',
  'reuseProbability',
  'recency',
] as const;

export const QAS_OPTIONAL_FEATURE_NAMES = ['memoryCost', 'promotionCost'] as const;
export const QAS_FEATURE_NAMES = [...QAS_CORE_FEATURE_NAMES, ...QAS_OPTIONAL_FEATURE_NAMES] as const;

export type QasFeatureName = typeof QAS_FEATURE_NAMES[number];
export type QasCoreFeatureName = typeof QAS_CORE_FEATURE_NAMES[number];

export interface QueryAdaptiveCandidate {
  packetKey: string;
  sourceRef: string;
  symbolVersionId?: string | null;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  featureRevision: string;
  features: Record<QasCoreFeatureName, number> & Partial<Record<typeof QAS_OPTIONAL_FEATURE_NAMES[number], number>>;
}

export interface QueryAdaptiveWeights {
  semantic: number;
  lexical: number;
  structural: number;
  domain: number;
  execution: number;
}

export interface QueryAdaptiveSample {
  packetKey: string;
  sourceRef: string;
  symbolVersionId: string | null;
  proposalScore: number;
  sampleRank: number;
  exactPromotionRequired: true;
}

export interface QueryAdaptiveSamplingReceipt {
  schemaVersion: 'atlas.qas.sampling-receipt.v1';
  status: 'PROVEN_FIXTURE' | 'PROVEN_INPUT' | 'DEFERRED_NO_FEATURE_MATRIX';
  workspaceRevision: string;
  representationRevision: string;
  queryRevision: string;
  candidateCount: number;
  sampleCount: number;
  featureRevision: string | null;
  selectedPacketKeys: string[];
  selectedSourceRefs: string[];
  exactPromotionRequired: true;
  canonicalWrites: false;
}

const finite = (value: number, field: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return Math.max(0, Math.min(1, value));
};

function stableUnit(seed: string): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function assertCandidate(candidate: QueryAdaptiveCandidate): void {
  if (!candidate.packetKey || !candidate.sourceRef) {
    throw new Error('QAS candidates require packetKey and sourceRef');
  }
  if (!candidate.workspaceRevision || !candidate.sourceRevision || !candidate.representationRevision || !candidate.featureRevision) {
    throw new Error(`QAS candidate ${candidate.packetKey} is missing revision lineage`);
  }
  for (const name of QAS_CORE_FEATURE_NAMES) finite(candidate.features[name], name);
  for (const name of QAS_OPTIONAL_FEATURE_NAMES) {
    if (candidate.features[name] !== undefined) finite(candidate.features[name], name);
  }
}

function proposalScore(
  candidate: QueryAdaptiveCandidate,
  weights: QueryAdaptiveWeights,
): number {
  const f = candidate.features;
  const semantic = f.semanticAffinity + f.reuseProbability;
  const lexical = f.lexicalAffinity + f.recency;
  const structural = f.graphAuthority + f.astAffinity + f.processAffinity;
  const domain = f.domainAffinity;
  const execution = f.priorExecutionSuccess;
  const costPenalty = 0.5 * (f.memoryCost ?? 0) + 0.5 * (f.promotionCost ?? 0);
  return Math.max(0, (
    weights.semantic * semantic
    + weights.lexical * lexical
    + weights.structural * structural
    + weights.domain * domain
    + weights.execution * execution
    - costPenalty
  ));
}

/**
 * Deterministic Tang-inspired candidate sketch. This is a routing heuristic,
 * not a theorem implementation and not a replacement for exact retrieval.
 */
export function sampleQueryAdaptiveCandidates(input: {
  candidates: QueryAdaptiveCandidate[];
  weights: QueryAdaptiveWeights;
  sampleSize: number;
  seed: string;
}): QueryAdaptiveSample[] {
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1) {
    throw new Error('sampleSize must be a positive integer');
  }

  const scored = input.candidates.map((candidate) => {
    assertCandidate(candidate);
    const score = proposalScore(candidate, input.weights);
    const probability = score > 0 ? score : Number.EPSILON;
    const draw = Math.max(Number.EPSILON, stableUnit(`${input.seed}\0${candidate.packetKey}`));
    return {
      candidate,
      key: -Math.log(draw) / probability,
      score,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.key - b.key || a.candidate.packetKey.localeCompare(b.candidate.packetKey))
    .slice(0, Math.min(input.sampleSize, scored.length))
    .map(({ candidate, score }, index) => ({
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      symbolVersionId: candidate.symbolVersionId ?? null,
      proposalScore: Number(score.toFixed(8)),
      sampleRank: index + 1,
      exactPromotionRequired: true,
    }));
}

export function buildQueryAdaptiveSamplingReceipt(input: {
  status: QueryAdaptiveSamplingReceipt['status'];
  workspaceRevision: string;
  representationRevision: string;
  queryRevision: string;
  candidateCount: number;
  featureRevision?: string | null;
  samples: QueryAdaptiveSample[];
}): QueryAdaptiveSamplingReceipt {
  return {
    schemaVersion: 'atlas.qas.sampling-receipt.v1',
    status: input.status,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    queryRevision: input.queryRevision,
    candidateCount: input.candidateCount,
    sampleCount: input.samples.length,
    featureRevision: input.featureRevision ?? null,
    selectedPacketKeys: input.samples.map((sample) => sample.packetKey),
    selectedSourceRefs: input.samples.map((sample) => sample.sourceRef),
    exactPromotionRequired: true,
    canonicalWrites: false,
  };
}
