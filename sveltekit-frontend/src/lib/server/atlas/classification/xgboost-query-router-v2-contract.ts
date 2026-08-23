import { z } from 'zod';
import { RETRIEVAL_ROUTER_TENSOR_REVISION_V2, RETRIEVAL_ROUTER_TENSOR_WIDTH_V2 } from './retrieval-router-tensor-manifest-v2.js';

export const XgboostQueryRouterV2ContractSchema = z.object({
  schema: z.literal('atlas.xgboost-query-router.v2'),
  role: z.literal('CONTROL_PLANE_ROUTER'),
  objective: z.literal('multi:softprob'),
  tensorRevision: z.literal(RETRIEVAL_ROUTER_TENSOR_REVISION_V2),
  tensorWidth: z.literal(RETRIEVAL_ROUTER_TENSOR_WIDTH_V2),
  modelRevision: z.string().min(1),
  trainingSnapshotRevision: z.string().min(1),
  classVocabularyRevision: z.string().min(1),
  calibrationRevision: z.string().min(1),
  probabilityOutputRequired: z.literal(true),
  abstentionRequired: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  productionOwnerChanged: z.literal(false),
}).strict();
export type XgboostQueryRouterV2Contract = z.infer<typeof XgboostQueryRouterV2ContractSchema>;

export const XGBOOST_QUERY_ROUTER_V2_CHALLENGER: XgboostQueryRouterV2Contract = {
  schema: 'atlas.xgboost-query-router.v2',
  role: 'CONTROL_PLANE_ROUTER',
  objective: 'multi:softprob',
  tensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  tensorWidth: RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
  modelRevision: 'UNBOUND',
  trainingSnapshotRevision: 'UNBOUND',
  classVocabularyRevision: 'UNBOUND',
  calibrationRevision: 'UNBOUND',
  probabilityOutputRequired: true,
  abstentionRequired: true,
  canonicalWritesAllowed: false,
  retrievalVoteAdded: false,
  productionOwnerChanged: false,
};

export function assertXgboostSoftprobOutputV2(input: {
  probabilities: readonly number[];
  classCount: number;
}): void {
  if (!Number.isInteger(input.classCount) || input.classCount < 2) throw new Error('XGBOOST_ROUTER_CLASS_COUNT_INVALID');
  if (input.probabilities.length !== input.classCount) throw new Error('XGBOOST_ROUTER_PROBABILITY_WIDTH_MISMATCH');
  let sum = 0;
  for (const value of input.probabilities) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('XGBOOST_ROUTER_PROBABILITY_INVALID');
    sum += value;
  }
  if (Math.abs(sum - 1) > 1e-3) throw new Error(`XGBOOST_ROUTER_PROBABILITY_SUM_INVALID sum=${sum}`);
}
