import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION,
  QUERY_DOMAINS_V2,
  QUERY_OPERATIONS_V2,
  QueryRetrievalNeedsV2Schema,
  queryDigestV2,
} from './query-classification-v2.js';
import {
  QUERY_FEATURE_CONTRACT_REVISION,
  flattenQueryFeaturesV1,
  projectQueryFeaturesV1,
} from './query-feature-projection-v1.js';

export const QUERY_ROUTER_DATASET_SCHEMA = 'atlas.query-router-dataset.v1' as const;
export const QUERY_ROUTER_SOURCE_RECORD_SCHEMA = 'atlas.query-router-evaluation-record.v1' as const;
export const QUERY_ROUTER_TENSOR_REVISION = 'atlas.query-router-tensor.v1' as const;
export const QUERY_ROUTER_BUDGET_NORMALIZATION_REVISION = 'atlas.query-router-budget-normalization.v1' as const;
export const CLASSIFICATION_NATIVE_DIMENSION = 768 as const;
export const CLASSIFICATION_ROUTER_DIMENSION = 128 as const;

export const QUERY_ROUTER_RETRIEVAL_NEED_ORDER = [
  'lexicalExact','sparseContextual','sparseExpansion','semantic','ast','graph','exactSymbol','mutationFreshness',
] as const;

const FiniteVector768Schema = z.array(z.number().finite()).length(CLASSIFICATION_NATIVE_DIMENSION);
const RevisionSchema = z.string().trim().min(1);

export const QueryRouterEvaluationRecordV1Schema = z.object({
  schema: z.literal(QUERY_ROUTER_SOURCE_RECORD_SCHEMA),
  queryId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  queryRevision: RevisionSchema,
  labelRevision: RevisionSchema,
  embeddingModelId: z.literal('google/embeddinggemma-300m'),
  embeddingModelRevision: RevisionSchema,
  embeddingPromptRevision: z.literal(EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION),
  embeddingSourceRepresentationId: z.literal('classification_768'),
  embedding768: FiniteVector768Schema,
  domainLabel: z.enum(QUERY_DOMAINS_V2),
  operationLabel: z.enum(QUERY_OPERATIONS_V2),
  retrievalNeeds: QueryRetrievalNeedsV2Schema,
  budgetTargets: z.object({
    candidateBudget: z.number().int().min(8).max(4096),
    graphHops: z.number().int().min(0).max(6),
    rerankBudget: z.number().int().min(0).max(256),
  }).strict(),
  evidenceRefs: z.array(z.string().trim().min(1)).default([]),
}).strict();

export type QueryRouterEvaluationRecordV1 = z.infer<typeof QueryRouterEvaluationRecordV1Schema>;

export const QueryRouterTrainingRowV1Schema = z.object({
  query_id: z.string().min(1),
  embedding_mrl_128: z.array(z.number().finite()).length(128),
  query_features: z.array(z.number().finite()).length(26),
  domain_label: z.enum(QUERY_DOMAINS_V2),
  operation_label: z.enum(QUERY_OPERATIONS_V2),
  retrieval_needs: z.array(z.number().finite().min(0).max(1)).length(8),
  budget_targets: z.array(z.number().finite().min(0).max(1)).length(3),
  query_digest: z.string().regex(/^[a-f0-9]{64}$/),
  query_revision: RevisionSchema,
  label_revision: RevisionSchema,
  embedding_model_id: z.literal('google/embeddinggemma-300m'),
  embedding_model_revision: RevisionSchema,
  prompt_revision: z.literal(EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION),
  embedding_source_representation_id: z.literal('classification_768'),
  embedding_representation_id: z.literal('classification_mrl_128'),
  projection_revision: z.literal('MRL_PREFIX_128_FLOAT32_L2_V1'),
  feature_revision: z.literal(QUERY_FEATURE_CONTRACT_REVISION),
  tensor_revision: z.literal(QUERY_ROUTER_TENSOR_REVISION),
  budget_normalization_revision: z.literal(QUERY_ROUTER_BUDGET_NORMALIZATION_REVISION),
  source_record_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  evidence_refs: z.array(z.string().min(1)),
}).strict();

export type QueryRouterTrainingRowV1 = z.infer<typeof QueryRouterTrainingRowV1Schema>;

export interface QueryRouterDatasetReceiptV1 {
  schema: typeof QUERY_ROUTER_DATASET_SCHEMA;
  rowCount: number;
  sourceRecordCount: number;
  datasetSha256: string;
  sourceRecordsSha256: string;
  embeddingModelId: 'google/embeddinggemma-300m';
  embeddingModelRevision: string;
  embeddingPromptRevision: typeof EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION;
  sourceRepresentationId: 'classification_768';
  routerRepresentationId: 'classification_mrl_128';
  projectionRevision: 'MRL_PREFIX_128_FLOAT32_L2_V1';
  featureRevision: typeof QUERY_FEATURE_CONTRACT_REVISION;
  tensorRevision: typeof QUERY_ROUTER_TENSOR_REVISION;
  budgetNormalizationRevision: typeof QUERY_ROUTER_BUDGET_NORMALIZATION_REVISION;
  labelRevision: string;
  inputDimension: 154;
  evidenceAuthority: false;
  canonicalOwnerChanged: false;
  canonicalWritesAllowed: false;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function float32L2Prefix(input: readonly number[], dimension: number): number[] {
  if (input.length !== CLASSIFICATION_NATIVE_DIMENSION) throw new Error(`QUERY_ROUTER_NATIVE_EMBEDDING_DIMENSION_MISMATCH:${input.length}`);
  const prefix = new Float32Array(dimension);
  let normSq = 0;
  for (let index = 0; index < dimension; index += 1) {
    const value = Math.fround(input[index]);
    if (!Number.isFinite(value)) throw new Error(`QUERY_ROUTER_NONFINITE_EMBEDDING:${index}`);
    prefix[index] = value;
    normSq += value * value;
  }
  const norm = Math.sqrt(normSq);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('QUERY_ROUTER_ZERO_OR_INVALID_MRL_NORM');
  return Array.from(prefix, (value) => Math.fround(value / norm));
}

export function projectClassification768ToMrl128(input: readonly number[]): number[] {
  return float32L2Prefix(input, CLASSIFICATION_ROUTER_DIMENSION);
}

export function normalizeQueryRouterBudgets(input: QueryRouterEvaluationRecordV1['budgetTargets']): [number, number, number] {
  return [(input.candidateBudget - 8) / (4096 - 8), input.graphHops / 6, input.rerankBudget / 256];
}

export function compileQueryRouterTrainingRowV1(raw: unknown): QueryRouterTrainingRowV1 {
  const input = QueryRouterEvaluationRecordV1Schema.parse(raw);
  const featureProjection = projectQueryFeaturesV1(input.query);
  const queryDigest = queryDigestV2(input.query);
  if (featureProjection.queryDigest !== queryDigest) throw new Error('QUERY_ROUTER_QUERY_DIGEST_DISAGREEMENT');
  const sourceRecordSha256 = sha256(stable(input));
  return QueryRouterTrainingRowV1Schema.parse({
    query_id: input.queryId,
    embedding_mrl_128: projectClassification768ToMrl128(input.embedding768),
    query_features: Array.from(flattenQueryFeaturesV1(featureProjection), Number),
    domain_label: input.domainLabel,
    operation_label: input.operationLabel,
    retrieval_needs: QUERY_ROUTER_RETRIEVAL_NEED_ORDER.map((key) => input.retrievalNeeds[key]),
    budget_targets: normalizeQueryRouterBudgets(input),
    query_digest: queryDigest,
    query_revision: input.queryRevision,
    label_revision: input.labelRevision,
    embedding_model_id: input.embeddingModelId,
    embedding_model_revision: input.embeddingModelRevision,
    prompt_revision: input.embeddingPromptRevision,
    embedding_source_representation_id: input.embeddingSourceRepresentationId,
    embedding_representation_id: 'classification_mrl_128',
    projection_revision: 'MRL_PREFIX_128_FLOAT32_L2_V1',
    feature_revision: QUERY_FEATURE_CONTRACT_REVISION,
    tensor_revision: QUERY_ROUTER_TENSOR_REVISION,
    budget_normalization_revision: QUERY_ROUTER_BUDGET_NORMALIZATION_REVISION,
    source_record_sha256: sourceRecordSha256,
    evidence_refs: input.evidenceRefs,
  });
}

function onlyOne(values: readonly string[], label: string): string {
  const unique = [...new Set(values)];
  if (unique.length !== 1) throw new Error(`QUERY_ROUTER_MIXED_${label}:${unique.join(',')}`);
  return unique[0];
}

export function compileQueryRouterDatasetV1(rawRecords: readonly unknown[]): { rows: QueryRouterTrainingRowV1[]; jsonl: string; receipt: QueryRouterDatasetReceiptV1 } {
  if (rawRecords.length === 0) throw new Error('QUERY_ROUTER_DATASET_EMPTY');
  const parsed = rawRecords.map((record) => QueryRouterEvaluationRecordV1Schema.parse(record));
  const embeddingModelRevision = onlyOne(parsed.map((row) => row.embeddingModelRevision), 'EMBEDDING_MODEL_REVISION');
  const embeddingPromptRevision = onlyOne(parsed.map((row) => row.embeddingPromptRevision), 'PROMPT_REVISION');
  const labelRevision = onlyOne(parsed.map((row) => row.labelRevision), 'LABEL_REVISION');
  const rows = parsed.map(compileQueryRouterTrainingRowV1);
  const jsonl = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const sourceRecordsCanonical = `${parsed.map((row) => stable(row)).join('\n')}\n`;
  return { rows, jsonl, receipt: {
    schema: QUERY_ROUTER_DATASET_SCHEMA,
    rowCount: rows.length,
    sourceRecordCount: parsed.length,
    datasetSha256: sha256(jsonl),
    sourceRecordsSha256: sha256(sourceRecordsCanonical),
    embeddingModelId: 'google/embeddinggemma-300m',
    embeddingModelRevision,
    embeddingPromptRevision: embeddingPromptRevision as typeof EMBEDDINGGEMMA_CLASSIFICATION_PROMPT_REVISION,
    sourceRepresentationId: 'classification_768',
    routerRepresentationId: 'classification_mrl_128',
    projectionRevision: 'MRL_PREFIX_128_FLOAT32_L2_V1',
    featureRevision: QUERY_FEATURE_CONTRACT_REVISION,
    tensorRevision: QUERY_ROUTER_TENSOR_REVISION,
    budgetNormalizationRevision: QUERY_ROUTER_BUDGET_NORMALIZATION_REVISION,
    labelRevision,
    inputDimension: 154,
    evidenceAuthority: false,
    canonicalOwnerChanged: false,
    canonicalWritesAllowed: false,
  } };
}
