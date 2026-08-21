import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Stable logical labels for the learned query router.
 *
 * IMPORTANT: these labels describe user intent / retrieval needs. They never
 * name a concrete executor such as Qdrant HNSW, CAGRA, DiskANN, or SPLADE.
 * Executor selection is a deterministic policy layer so model training does
 * not become coupled to infrastructure churn.
 */
export const QUERY_DOMAINS_V2 = [
  'code',
  'database',
  'retrieval',
  'graph',
  'api',
  'security',
  'documentation',
  'workflow',
  'testing',
  'unknown',
] as const;

export const QUERY_OPERATIONS_V2 = [
  'find',
  'explain',
  'debug',
  'modify',
  'compare',
  'trace',
  'test',
  'synthesize',
] as const;

const ProbabilitySchema = z.number().finite().min(0).max(1);

export const QueryRetrievalNeedsV2Schema = z.object({
  lexicalExact: ProbabilitySchema,
  sparseContextual: ProbabilitySchema,
  sparseExpansion: ProbabilitySchema,
  semantic: ProbabilitySchema,
  ast: ProbabilitySchema,
  graph: ProbabilitySchema,
  exactSymbol: ProbabilitySchema,
  mutationFreshness: ProbabilitySchema,
}).strict();

export const QueryBudgetPredictionV2Schema = z.object({
  candidateBudget: z.number().int().min(8).max(4096),
  graphHops: z.number().int().min(0).max(6),
  rerankBudget: z.number().int().min(0).max(256),
}).strict();

export const QueryClassificationV2Schema = z.object({
  schema: z.literal('atlas.query-classification.v2'),
  queryDigest: z.string().length(64),
  featureContractRevision: z.string().min(1),
  modelRevision: z.string().min(1),

  /** EmbeddingGemma classification prompt, not retrieval-query embedding. */
  embeddingModelId: z.literal('google/embeddinggemma-300m'),
  embeddingRepresentationId: z.literal('classification_mrl_128'),
  embeddingSourceRepresentationId: z.literal('classification_768'),
  embeddingDimension: z.literal(128),
  embeddingPromptRevision: z.string().min(1),

  domain: z.enum(QUERY_DOMAINS_V2),
  domainProbabilities: z.record(z.enum(QUERY_DOMAINS_V2), ProbabilitySchema),
  operation: z.enum(QUERY_OPERATIONS_V2),
  operationProbabilities: z.record(z.enum(QUERY_OPERATIONS_V2), ProbabilitySchema),

  retrievalNeeds: QueryRetrievalNeedsV2Schema,
  budget: QueryBudgetPredictionV2Schema,
  confidence: ProbabilitySchema,

  /** Classification plans work; it is not evidence authority. */
  evidenceAuthority: z.literal(false),
}).strict();

export type QueryDomainV2 = (typeof QUERY_DOMAINS_V2)[number];
export type QueryOperationV2 = (typeof QUERY_OPERATIONS_V2)[number];
export type QueryRetrievalNeedsV2 = z.infer<typeof QueryRetrievalNeedsV2Schema>;
export type QueryClassificationV2 = z.infer<typeof QueryClassificationV2Schema>;

export const EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION =
  'embeddinggemma-classification-prompt-google-model-card-v1' as const;

export function formatEmbeddingGemmaClassificationInput(content: string): string {
  const normalized = content.trim();
  if (!normalized) throw new Error('EMBEDDINGGEMMA_CLASSIFICATION_QUERY_REQUIRED');
  return `task: classification | query: ${normalized}`;
}

export function queryDigestV2(query: string): string {
  return createHash('sha256').update(query.trim(), 'utf8').digest('hex');
}
