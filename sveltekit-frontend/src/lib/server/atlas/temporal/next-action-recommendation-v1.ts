import { z } from 'zod';
import { ActionOpcodeSchema } from './agent-action-event-v1.js';

const Unit = z.number().finite().min(0).max(1);
const Score100 = z.number().finite().min(0).max(100);
const S = z.string().min(1);

export const ActionFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.action-feature-row.v1'),
  requestId: S,
  candidateId: S,
  opcode: ActionOpcodeSchema,
  targetCanonicalId: S.nullable(),
  executionKey: S,
  workspaceRevision: S,
  graphRevision: S.nullable(),
  featureRevision: S,
  features: z.object({
    semanticAffinity: Unit,
    structuralAffinity: Unit,
    queryClassAffinity: Unit,
    historicalSuccessRate: Unit,
    lastFailureSimilarity: Unit,
    cacheHitProbability: Unit,
    informationGain: Unit,
    executionCost: Unit,
    latencyCost: Unit,
    mutationRisk: Unit,
    tokenSavings: Unit,
    dependencyReadiness: Unit,
  }).strict(),
  evidenceRefs: z.array(S).default([]),
}).strict();
export type ActionFeatureRowV1 = z.infer<typeof ActionFeatureRowV1Schema>;

export const NextActionRecommendationV1Schema = z.object({
  schema: z.literal('atlas.next-action-recommendation.v1'),
  requestId: S,
  candidateId: S,
  executionKey: S,
  opcode: ActionOpcodeSchema,
  targetCanonicalId: S.nullable(),
  score: Score100,
  rank: z.number().int().positive(),
  components: z.object({
    evidenceFit: Score100,
    historicalUtility: Score100,
    informationGain: Score100,
    costPenalty: Score100,
    riskPenalty: Score100,
  }).strict(),
  exactGateRequired: z.literal(true),
  evidenceRefs: z.array(S).default([]),
  policyRevision: S,
}).strict();
export type NextActionRecommendationV1 = z.infer<typeof NextActionRecommendationV1Schema>;

export const RecommendationOutcomeReceiptV1Schema = z.object({
  schema: z.literal('atlas.recommendation-outcome-receipt.v1'),
  requestId: S,
  candidateId: S,
  executionKey: S,
  followed: z.boolean(),
  actionEventId: S.nullable(),
  succeeded: z.boolean().nullable(),
  downstreamUtility: Unit.nullable(),
  observedAt: z.string().datetime(),
  policyRevision: S,
}).strict();

export function rankNextActions(input: {
  rows: ActionFeatureRowV1[];
  policyRevision: string;
  limit?: number;
}): NextActionRecommendationV1[] {
  const limit = Math.max(1, Math.min(64, input.limit ?? 16));
  return input.rows.map((row) => {
    const f = row.features;
    const evidenceFit = 100 * (0.35 * f.semanticAffinity + 0.4 * f.structuralAffinity + 0.25 * f.queryClassAffinity);
    const historicalUtility = 100 * (0.7 * f.historicalSuccessRate + 0.3 * f.dependencyReadiness);
    const informationGain = 100 * f.informationGain;
    const costPenalty = 100 * (0.45 * f.executionCost + 0.35 * f.latencyCost + 0.2 * (1 - f.tokenSavings));
    const riskPenalty = 100 * f.mutationRisk;
    const score = Math.max(0, Math.min(100,
      0.35 * evidenceFit + 0.25 * historicalUtility + 0.3 * informationGain + 10 * f.cacheHitProbability - 0.2 * costPenalty - 0.2 * riskPenalty,
    ));
    return {
      row,
      score,
      components: { evidenceFit, historicalUtility, informationGain, costPenalty, riskPenalty },
    };
  }).sort((a, b) => b.score - a.score || a.row.candidateId.localeCompare(b.row.candidateId))
    .slice(0, limit)
    .map((entry, index) => NextActionRecommendationV1Schema.parse({
      schema: 'atlas.next-action-recommendation.v1',
      requestId: entry.row.requestId,
      candidateId: entry.row.candidateId,
      executionKey: entry.row.executionKey,
      opcode: entry.row.opcode,
      targetCanonicalId: entry.row.targetCanonicalId,
      score: entry.score,
      rank: index + 1,
      components: entry.components,
      exactGateRequired: true,
      evidenceRefs: entry.row.evidenceRefs,
      policyRevision: input.policyRevision,
    }));
}
