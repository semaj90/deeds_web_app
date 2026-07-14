/**
 * Canonical runtime reranking contract.
 *
 * Owns candidate validation, deterministic fallback ranking,
 * and common reranker output/provenance.
 *
 * Candidate retrieval and persistence are owned by the retrieval facade.
 */

import { z } from 'zod';

export const SIGNAL_KEYS = [
  'dense',
  'bm25',
  'ast',
  'graph',
  'pagerank',
  'domain',
  'crossEncoder',
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

export const BlendWeightsSchema = z
  .object({
    dense: z.number().min(0).max(1),
    bm25: z.number().min(0).max(1),
    ast: z.number().min(0).max(1),
    graph: z.number().min(0).max(1),
    pagerank: z.number().min(0).max(1),
    domain: z.number().min(0).max(1),
    crossEncoder: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((weights, ctx) => {
    const sum = Object.values(weights).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 0.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Blend weights must sum to 1.0; received ${sum}`,
      });
    }
  });

export type BlendWeights = z.infer<typeof BlendWeightsSchema>;

export const RerankCandidateSchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  content: z.string().min(0),
  retrievedRank: z.number().int().min(1),
  denseScore: z.number().min(0).max(1).optional(),
  bm25Score: z.number().min(0).max(1).optional(),
  astScore: z.number().min(0).max(1).optional(),
  graphScore: z.number().min(0).max(1).optional(),
  pagerankScore: z.number().min(0).max(1).optional(),
  domainScore: z.number().min(0).max(1).optional(),
  crossEncoderScore: z.number().finite().optional(),
  crossEncoderScoreNormalized: z.number().min(0).max(1).optional(),
});

export type RerankCandidate = z.infer<typeof RerankCandidateSchema>;

export const RerankedCandidateSchema = RerankCandidateSchema.extend({
  blendedScore: z.number().min(0).max(1),
  rankAfter: z.number().int().min(1),
  modelVersion: z.string(),
  blendWeights: BlendWeightsSchema,
  evidence: z
    .object({
      semanticLane: z.string().optional(),
      lexicalLane: z.string().optional(),
      topologyLane: z.string().optional(),
    })
    .optional(),
});

export type RerankedCandidate = z.infer<typeof RerankedCandidateSchema>;

export type RerankProfile = 'deterministic' | 'xgboost' | 'crossencoder';

export const RerankContextSchema = z.object({
  requestId: z.string().min(1),
  query: z.string().min(1),
  candidates: z.array(RerankCandidateSchema),
  limit: z.number().int().min(1),
  profile: z.enum(['deterministic', 'xgboost', 'crossencoder']),
});

export type RerankContext = z.infer<typeof RerankContextSchema>;

export type RerankProvenance = {
  modelVersion: string;
  rankingStage: 'deterministic' | 'xgboost' | 'crossencoder' | 'xgboost_fallback';
  crossEncoderAttempted: boolean;
  crossEncoderUsed: boolean;
  fallbackReason?: string;
  latencyMs?: number;
};

export type RerankOutput = {
  ranked: RerankedCandidate[];
  provenance: RerankProvenance;
};

export interface RuntimeReranker {
  rerank(input: RerankContext): Promise<RerankOutput>;
  modelVersion(): string;
}

export const DEFAULT_BLEND_WEIGHTS: BlendWeights = {
  dense: 0.4,
  bm25: 0.3,
  ast: 0.05,
  graph: 0.05,
  pagerank: 0.1,
  domain: 0.1,
  crossEncoder: 0,
};

const weightSum = Object.values(DEFAULT_BLEND_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.0001) {
  throw new Error(`Blend weights must sum to 1.0, got ${weightSum}`);
}

export function normalizeScore(value: number, min: number = 0, max: number = 1): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function pickCrossEncoderScore(candidate: RerankCandidate): number | undefined {
  if (candidate.crossEncoderScoreNormalized !== undefined) {
    return candidate.crossEncoderScoreNormalized;
  }
  if (candidate.crossEncoderScore === undefined) {
    return undefined;
  }
  if (candidate.crossEncoderScore < 0 || candidate.crossEncoderScore > 1) {
    return undefined;
  }
  return candidate.crossEncoderScore;
}

export function blendScores(candidate: RerankCandidate, weights: BlendWeights): number {
  const scores: Record<SignalKey, number | undefined> = {
    dense: candidate.denseScore,
    bm25: candidate.bm25Score,
    ast: candidate.astScore,
    graph: candidate.graphScore,
    pagerank: candidate.pagerankScore,
    domain: candidate.domainScore,
    crossEncoder: pickCrossEncoderScore(candidate),
  };

  let weightedScore = 0;
  let activeWeight = 0;

  for (const key of SIGNAL_KEYS) {
    const weight = weights[key];
    const score = scores[key];
    if (weight <= 0 || score === undefined) continue;
    weightedScore += score * weight;
    activeWeight += weight;
  }

  if (activeWeight === 0) return 0;
  return Math.max(0, Math.min(1, weightedScore / activeWeight));
}

function zeroSafeLabel(name: string, score: number | undefined): string | undefined {
  return score !== undefined ? `${name}=${score.toFixed(2)}` : undefined;
}

export class DeterministicReranker implements RuntimeReranker {
  private readonly blendWeights: BlendWeights;
  private readonly version = 'deterministic-v1.0';

  constructor(weights: BlendWeights = DEFAULT_BLEND_WEIGHTS) {
    this.blendWeights = BlendWeightsSchema.parse(weights);
  }

  async rerank(input: RerankContext): Promise<RerankOutput> {
    const context = RerankContextSchema.parse(input);
    if (context.candidates.length === 0) {
      return {
        ranked: [],
        provenance: {
          modelVersion: this.version,
          rankingStage: 'deterministic',
          crossEncoderAttempted: false,
          crossEncoderUsed: false,
          latencyMs: 0,
        },
      };
    }

    const ranked = context.candidates
      .map((candidate) => ({
        ...candidate,
        blendedScore: blendScores(candidate, this.blendWeights),
        rankAfter: 0,
        modelVersion: this.version,
        blendWeights: this.blendWeights,
        evidence: {
          semanticLane: zeroSafeLabel('dense', candidate.denseScore),
          lexicalLane: zeroSafeLabel('bm25', candidate.bm25Score),
          topologyLane: zeroSafeLabel('pr', candidate.pagerankScore),
        },
      }))
      .sort(
        (a, b) =>
          b.blendedScore - a.blendedScore ||
          a.retrievedRank - b.retrievedRank ||
          a.packetKey.localeCompare(b.packetKey),
      )
      .map((candidate, index) => ({
        ...candidate,
        rankAfter: index + 1,
      }));

    return {
      ranked,
      provenance: {
        modelVersion: this.version,
        rankingStage: 'deterministic',
        crossEncoderAttempted: false,
        crossEncoderUsed: false,
        latencyMs: 0,
      },
    };
  }

  modelVersion(): string {
    return this.version;
  }
}

