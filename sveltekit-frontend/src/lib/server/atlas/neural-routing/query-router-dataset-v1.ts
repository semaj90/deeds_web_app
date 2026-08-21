import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QUERY_DOMAINS_V2, QUERY_OPERATIONS_V2 } from './query-classification-v2.js';

export const QUERY_ROUTER_DATASET_SCHEMA = 'atlas.query-router-dataset-row.v1' as const;
export const QUERY_ROUTER_DATASET_CONTRACT_REVISION = 'atlas.query-router-dataset.v1' as const;
export const QUERY_ROUTER_EMBEDDING_MODEL_ID = 'google/embeddinggemma-300m' as const;
export const QUERY_ROUTER_EMBEDDING_REPRESENTATION_ID = 'classification_mrl_128' as const;
export const QUERY_ROUTER_EMBEDDING_SOURCE_REPRESENTATION_ID = 'classification_768' as const;
export const QUERY_ROUTER_EMBEDDING_DIMENSION = 128 as const;
export const QUERY_ROUTER_QUERY_FEATURE_DIMENSION = 26 as const;
export const QUERY_ROUTER_RETRIEVAL_NEED_DIMENSION = 8 as const;
export const QUERY_ROUTER_BUDGET_DIMENSION = 3 as const;

const ProbabilitySchema = z.number().finite().min(0).max(1);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i);

export const QueryRouterRetrievalNeedTargetsV1Schema = z.object({
  lexicalExact: ProbabilitySchema,
  sparseContextual: ProbabilitySchema,
  sparseExpansion: ProbabilitySchema,
  semantic: ProbabilitySchema,
  ast: ProbabilitySchema,
  graph: ProbabilitySchema,
  exactSymbol: ProbabilitySchema,
  mutationFreshness: ProbabilitySchema,
}).strict();

export const QueryRouterBudgetTargetsV1Schema = z.object({
  candidateBudget: z.number().int().min(8).max(4096),
  graphHops: z.number().int().min(0).max(6),
  rerankBudget: z.number().int().min(0).max(256),
}).strict();

/**
 * Human/reviewed label input. No embeddings or derived numeric query features
 * are accepted here: the exporter owns those projections deterministically.
 */
export const QueryRouterSeedV1Schema = z.object({
  schema: z.literal('atlas.query-router-seed.v1'),
  queryId: z.string().min(1),
  query: z.string().min(1),
  queryRevision: z.string().min(1),
  labelRevision: z.string().min(1),
  domainLabel: z.enum(QUERY_DOMAINS_V2),
  operationLabel: z.enum(QUERY_OPERATIONS_V2),
  retrievalNeeds: QueryRouterRetrievalNeedTargetsV1Schema,
  budget: QueryRouterBudgetTargetsV1Schema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();

export const QueryRouterDatasetRowV1Schema = z.object({
  schema: z.literal(QUERY_ROUTER_DATASET_SCHEMA),
  query_id: z.string().min(1),
  query_digest: Sha256Schema,
  query_revision: z.string().min(1),
  label_revision: z.string().min(1),

  embedding_model_id: z.literal(QUERY_ROUTER_EMBEDDING_MODEL_ID),
  embedding_model_revision: z.string().min(1),
  embedding_prompt_revision: z.string().min(1),
  embedding_source_representation_id: z.literal(QUERY_ROUTER_EMBEDDING_SOURCE_REPRESENTATION_ID),
  embedding_representation_id: z.literal(QUERY_ROUTER_EMBEDDING_REPRESENTATION_ID),
  embedding_projection_revision: z.string().min(1),
  embedding_mrl_128: z.array(z.number().finite()).length(QUERY_ROUTER_EMBEDDING_DIMENSION),

  query_feature_contract_revision: z.string().min(1),
  query_features: z.array(z.number().finite()).length(QUERY_ROUTER_QUERY_FEATURE_DIMENSION),

  domain_label: z.enum(QUERY_DOMAINS_V2),
  operation_label: z.enum(QUERY_OPERATIONS_V2),
  retrieval_needs: z.array(ProbabilitySchema).length(QUERY_ROUTER_RETRIEVAL_NEED_DIMENSION),
  budget_targets: z.array(ProbabilitySchema).length(QUERY_ROUTER_BUDGET_DIMENSION),

  evidence_refs: z.array(z.string().min(1)),
  source_seed_digest: Sha256Schema,
  dataset_contract_revision: z.literal(QUERY_ROUTER_DATASET_CONTRACT_REVISION),
  evidenceAuthority: z.literal(false),
}).strict();

export type QueryRouterSeedV1 = z.infer<typeof QueryRouterSeedV1Schema>;
export type QueryRouterDatasetRowV1 = z.infer<typeof QueryRouterDatasetRowV1Schema>;

export const QUERY_ROUTER_RETRIEVAL_NEED_ORDER_V1 = [
  'lexicalExact',
  'sparseContextual',
  'sparseExpansion',
  'semantic',
  'ast',
  'graph',
  'exactSymbol',
  'mutationFreshness',
] as const satisfies readonly (keyof z.infer<typeof QueryRouterRetrievalNeedTargetsV1Schema>)[];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scale(value: number, min: number, max: number): number {
  if (max <= min) throw new Error('QUERY_ROUTER_INVALID_SCALE');
  return clamp01((value - min) / (max - min));
}

export function normalizeQueryRouterBudgetTargetsV1(
  budget: z.infer<typeof QueryRouterBudgetTargetsV1Schema>,
): [number, number, number] {
  return [
    scale(budget.candidateBudget, 8, 4096),
    scale(budget.graphHops, 0, 6),
    scale(budget.rerankBudget, 0, 256),
  ];
}

export function flattenQueryRouterRetrievalNeedsV1(
  targets: z.infer<typeof QueryRouterRetrievalNeedTargetsV1Schema>,
): [number, number, number, number, number, number, number, number] {
  return QUERY_ROUTER_RETRIEVAL_NEED_ORDER_V1.map((name) => targets[name]) as [
    number, number, number, number, number, number, number, number,
  ];
}

export function sha256QueryRouterValueV1(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
