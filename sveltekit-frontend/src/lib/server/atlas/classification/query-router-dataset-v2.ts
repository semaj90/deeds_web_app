import { createHash } from 'node:crypto';
import { z } from 'zod';
import { projectEmbeddingGemmaMrlV1 } from '../embedding/embeddinggemma-task-representation-v1.js';
import { projectQueryFeaturesV1 } from './query-feature-projection-v1.js';
import { buildRetrievalRouterTensorV2, RETRIEVAL_ROUTER_TENSOR_REVISION_V2 } from './retrieval-router-tensor-manifest-v2.js';

export const QUERY_ROUTER_DATASET_REVISION_V2 = 'atlas.query-router-dataset.v2' as const;
export const QUERY_ROUTER_SPLIT_REVISION_V1 = 'atlas.query-router-split.sha256-80-10-10.v1' as const;

const ProbabilityVector = (width: number) => z.array(z.number().finite().min(0).max(1)).length(width);
const FiniteVector = (width: number) => z.array(z.number().finite()).length(width);

export const QueryRouterSourceRowV2Schema = z.object({
  queryId: z.string().min(1),
  query: z.string().min(1),
  queryRevision: z.string().min(1),
  labelRevision: z.string().min(1),
  embeddingModelId: z.literal('google/embeddinggemma-300m'),
  embeddingModelRevision: z.string().min(1),
  embeddingPromptRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  classification768: FiniteVector(768),
  ontologyMask32: FiniteVector(32),
  operationFlags16: FiniteVector(16),
  runtimeResource16: FiniteVector(16),
  graphToolStructure16: FiniteVector(16),
  domainLabel: z.enum(['code','database','retrieval','graph','api','security','documentation','workflow','testing','unknown']),
  operationLabel: z.enum(['find','explain','debug','modify','compare','trace','test','synthesize']),
  retrievalNeeds: ProbabilityVector(8),
  budgetTargets: ProbabilityVector(3),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();
export type QueryRouterSourceRowV2 = z.infer<typeof QueryRouterSourceRowV2Schema>;

export const QueryRouterDatasetRowV2Schema = z.object({
  schema: z.literal('atlas.query-router-dataset-row.v2'),
  datasetRevision: z.literal(QUERY_ROUTER_DATASET_REVISION_V2),
  tensorRevision: z.literal(RETRIEVAL_ROUTER_TENSOR_REVISION_V2),
  splitRevision: z.literal(QUERY_ROUTER_SPLIT_REVISION_V1),
  split: z.enum(['train','validation','test']),
  queryId: z.string().min(1),
  queryDigest: z.string().length(64),
  queryRevision: z.string().min(1),
  labelRevision: z.string().min(1),
  embeddingModelId: z.literal('google/embeddinggemma-300m'),
  embeddingModelRevision: z.string().min(1),
  embeddingPromptRevision: z.string().min(1),
  representationId: z.literal('classification_mrl_128'),
  representationRevision: z.string().min(1),
  featureTensor234: FiniteVector(234),
  domainLabel: z.string().min(1),
  operationLabel: z.string().min(1),
  retrievalNeeds: ProbabilityVector(8),
  budgetTargets: ProbabilityVector(3),
  evidenceRefs: z.array(z.string().min(1)),
  rowDigest: z.string().length(64),
  evidenceAuthority: z.literal(false),
}).strict();
export type QueryRouterDatasetRowV2 = z.infer<typeof QueryRouterDatasetRowV2Schema>;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function deterministicQueryRouterSplitV1(queryId: string): 'train' | 'validation' | 'test' {
  const digest = sha256(`${QUERY_ROUTER_SPLIT_REVISION_V1}\u001f${queryId}`);
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
  if (bucket < 80) return 'train';
  if (bucket < 90) return 'validation';
  return 'test';
}

export function compileQueryRouterDatasetRowV2(sourceInput: QueryRouterSourceRowV2): QueryRouterDatasetRowV2 {
  const source = QueryRouterSourceRowV2Schema.parse(sourceInput);
  const mrl128 = projectEmbeddingGemmaMrlV1(source.classification768, 128);
  const queryFeatures = projectQueryFeaturesV1(source.query);
  const tensor = buildRetrievalRouterTensorV2({
    classificationMrl128: Array.from(mrl128),
    ontologyMask32: source.ontologyMask32,
    queryFeatures,
    operationFlags16: source.operationFlags16,
    runtimeResource16: source.runtimeResource16,
    graphToolStructure16: source.graphToolStructure16,
  });
  const identity = {
    queryId: source.queryId,
    queryDigest: queryFeatures.queryDigest,
    queryRevision: source.queryRevision,
    labelRevision: source.labelRevision,
    embeddingModelRevision: source.embeddingModelRevision,
    embeddingPromptRevision: source.embeddingPromptRevision,
    representationRevision: source.representationRevision,
    tensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
    splitRevision: QUERY_ROUTER_SPLIT_REVISION_V1,
    domainLabel: source.domainLabel,
    operationLabel: source.operationLabel,
    retrievalNeeds: source.retrievalNeeds,
    budgetTargets: source.budgetTargets,
  };
  return QueryRouterDatasetRowV2Schema.parse({
    schema: 'atlas.query-router-dataset-row.v2',
    datasetRevision: QUERY_ROUTER_DATASET_REVISION_V2,
    tensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
    splitRevision: QUERY_ROUTER_SPLIT_REVISION_V1,
    split: deterministicQueryRouterSplitV1(source.queryId),
    queryId: source.queryId,
    queryDigest: queryFeatures.queryDigest,
    queryRevision: source.queryRevision,
    labelRevision: source.labelRevision,
    embeddingModelId: source.embeddingModelId,
    embeddingModelRevision: source.embeddingModelRevision,
    embeddingPromptRevision: source.embeddingPromptRevision,
    representationId: 'classification_mrl_128',
    representationRevision: source.representationRevision,
    featureTensor234: Array.from(tensor),
    domainLabel: source.domainLabel,
    operationLabel: source.operationLabel,
    retrievalNeeds: source.retrievalNeeds,
    budgetTargets: source.budgetTargets,
    evidenceRefs: [...new Set(source.evidenceRefs)].sort(),
    rowDigest: sha256(JSON.stringify(identity)),
    evidenceAuthority: false,
  });
}
