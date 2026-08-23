import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ROUTING_FEATURE_NAMES, stableRoutingChecksum, type QueryRoutingFeatureVectorV1, type ToolTrainingExampleV1 } from './contracts.js';

export interface EncoderJsonlRowV1 {
  schemaVersion: 'atlas.encoder-jsonl-row.v1';
  exampleId: string;
  requestId: string;
  queryText: string;
  toolId: string;
  featureValues: number[];
  label: number;
  utility: number;
  verified: boolean;
  sourceChecksum: string;
}

export function toEncoderJsonlRows(examples: readonly ToolTrainingExampleV1[]): EncoderJsonlRowV1[] {
  return [...examples]
    .filter((example) => example.verified || example.label === 0)
    .sort((a, b) => a.exampleId.localeCompare(b.exampleId))
    .map((example) => ({
      schemaVersion: 'atlas.encoder-jsonl-row.v1',
      exampleId: example.exampleId,
      requestId: example.requestId,
      queryText: example.queryText,
      toolId: example.toolId,
      featureValues: [...example.featureValues],
      label: example.label,
      utility: example.utility,
      verified: example.verified,
      sourceChecksum: example.checksum,
    }));
}

export function serializeEncoderJsonl(examples: readonly ToolTrainingExampleV1[]): string {
  return toEncoderJsonlRows(examples).map((row) => JSON.stringify(row)).join('\n') + '\n';
}

export const EmbeddingGemmaClassificationExampleV1Schema = z.object({
  schemaVersion: z.literal('atlas.embeddinggemma-classification-example.v1'),
  exampleId: z.string().min(1),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  featureRevision: z.string().min(1),
  queryFeatures: z.array(z.number().finite()).length(18),
  embeddingRepresentationId: z.literal('classification_mrl_128'),
  embeddingModelRevision: z.string().min(1),
  promptRevision: z.string().min(1),
  embedding: z.array(z.number().finite()).length(128).nullable(),
  domainLabel: z.string().min(1),
  operationLabel: z.string().min(1),
  retrievalNeeds: z.array(z.string().min(1)).min(1),
  candidateBudget: z.number().int().positive(),
  labelRevision: z.string().min(1),
  evidenceRefs: z.array(z.string()),
  verified: z.boolean(),
  status: z.enum(['FEATURES_ONLY', 'TRAINING_READY']),
  checksum: z.string().length(64),
}).strict();

export type EmbeddingGemmaClassificationExampleV1 = z.infer<typeof EmbeddingGemmaClassificationExampleV1Schema>;

function queryDigest(queryText: string): string {
  return createHash('sha256').update(queryText.trim().toLowerCase(), 'utf8').digest('hex');
}

function assertUnitNorm(values: readonly number[]): void {
  if (values.length !== 128) throw new Error('CLASSIFICATION_MRL_DIMENSION_INVALID');
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm < 0.999 || norm > 1.001) {
    throw new Error('CLASSIFICATION_MRL_VECTOR_NOT_NORMALIZED');
  }
}

export function buildEmbeddingGemmaClassificationExample(input: {
  exampleId: string;
  requestId: string;
  queryText: string;
  featureVector: QueryRoutingFeatureVectorV1;
  embedding?: readonly number[] | null;
  embeddingModelRevision: string;
  promptRevision: string;
  domainLabel: string;
  operationLabel: string;
  retrievalNeeds: readonly string[];
  candidateBudget: number;
  labelRevision: string;
  evidenceRefs?: readonly string[];
  verified?: boolean;
}): EmbeddingGemmaClassificationExampleV1 {
  const embedding = input.embedding ? [...input.embedding] : null;
  if (embedding) assertUnitNorm(embedding);
  const base = {
    schemaVersion: 'atlas.embeddinggemma-classification-example.v1' as const,
    exampleId: input.exampleId,
    requestId: input.requestId,
    queryText: input.queryText,
    featureRevision: input.featureVector.featureRevision,
    queryFeatures: [...input.featureVector.values],
    embeddingRepresentationId: 'classification_mrl_128' as const,
    embeddingModelRevision: input.embeddingModelRevision,
    promptRevision: input.promptRevision,
    embedding,
    domainLabel: input.domainLabel,
    operationLabel: input.operationLabel,
    retrievalNeeds: [...input.retrievalNeeds].sort(),
    candidateBudget: input.candidateBudget,
    labelRevision: input.labelRevision,
    evidenceRefs: [...(input.evidenceRefs ?? [])].sort(),
    verified: input.verified ?? false,
    status: embedding ? 'TRAINING_READY' as const : 'FEATURES_ONLY' as const,
  };
  return EmbeddingGemmaClassificationExampleV1Schema.parse({
    ...base,
    checksum: stableRoutingChecksum(base),
  });
}

export function adaptToolTrainingExampleToClassificationExample(input: {
  example: ToolTrainingExampleV1;
  featureRevision: string;
  embedding?: readonly number[] | null;
  embeddingModelRevision: string;
  promptRevision: string;
  domainLabel: string;
  operationLabel: string;
  retrievalNeeds: readonly string[];
  candidateBudget: number;
  labelRevision: string;
}): EmbeddingGemmaClassificationExampleV1 {
  if (!input.example.verified) throw new Error('CLASSIFICATION_LABEL_EXAMPLE_UNVERIFIED');
  return buildEmbeddingGemmaClassificationExample({
    exampleId: input.example.exampleId,
    requestId: input.example.requestId,
    queryText: input.example.queryText,
    featureVector: {
      schemaVersion: 'atlas.query-routing-features.v1',
      featureRevision: input.featureRevision,
      featureOrder: [...ROUTING_FEATURE_NAMES],
      values: input.example.featureValues,
      sourceQueryDigest: queryDigest(input.example.queryText),
      embeddingRepresentationId: null,
      status: 'FEATURES_ONLY',
    },
    embedding: input.embedding,
    embeddingModelRevision: input.embeddingModelRevision,
    promptRevision: input.promptRevision,
    domainLabel: input.domainLabel,
    operationLabel: input.operationLabel,
    retrievalNeeds: input.retrievalNeeds,
    candidateBudget: input.candidateBudget,
    labelRevision: input.labelRevision,
    evidenceRefs: input.example.evidenceRefs,
    verified: input.example.verified,
  });
}

export interface WorkflowExecutionReceiptEvidenceV1 {
  receiptId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PARTIAL';
  outputs: {
    evidenceRefs: string[];
  };
  verifier: {
    schemaValid: boolean;
    provenanceValid: boolean;
    identityStable: boolean;
    replayStable: boolean;
  };
}

/**
 * Adapt the existing workflow-loop receipt without making the workflow loop
 * own classifier labels or embedding inference. Labels, revisions, and the
 * feature vector must be supplied by an approved producer explicitly.
 */
export function adaptWorkflowExecutionToClassificationExample(input: {
  exampleId: string;
  requestId: string;
  queryText: string;
  featureVector: QueryRoutingFeatureVectorV1;
  executionReceipt: WorkflowExecutionReceiptEvidenceV1;
  embedding?: readonly number[] | null;
  embeddingModelRevision: string;
  promptRevision: string;
  domainLabel: string;
  operationLabel: string;
  retrievalNeeds: readonly string[];
  candidateBudget: number;
  labelRevision: string;
  verified: boolean;
}): EmbeddingGemmaClassificationExampleV1 {
  const receipt = input.executionReceipt;
  const receiptProven = receipt.status === 'SUCCESS' &&
    receipt.verifier.schemaValid &&
    receipt.verifier.provenanceValid &&
    receipt.verifier.identityStable &&
    receipt.verifier.replayStable;

  if (input.verified && !receiptProven) {
    throw new Error('CLASSIFICATION_RECEIPT_NOT_PROVEN');
  }

  return buildEmbeddingGemmaClassificationExample({
    exampleId: input.exampleId,
    requestId: input.requestId,
    queryText: input.queryText,
    featureVector: input.featureVector,
    embedding: input.embedding,
    embeddingModelRevision: input.embeddingModelRevision,
    promptRevision: input.promptRevision,
    domainLabel: input.domainLabel,
    operationLabel: input.operationLabel,
    retrievalNeeds: input.retrievalNeeds,
    candidateBudget: input.candidateBudget,
    labelRevision: input.labelRevision,
    evidenceRefs: [...new Set([receipt.receiptId, ...receipt.outputs.evidenceRefs])],
    verified: input.verified,
  });
}

export function serializeEmbeddingGemmaClassificationJsonl(
  examples: readonly EmbeddingGemmaClassificationExampleV1[],
): string {
  return [...examples]
    .sort((a, b) => a.exampleId.localeCompare(b.exampleId))
    .map((example) => JSON.stringify(example))
    .join('\n') + '\n';
}
