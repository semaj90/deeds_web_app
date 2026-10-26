import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const packetKey = z.string().regex(/^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const nonNegativeInteger = z.number().int().nonnegative();

export const CandidateExpansionStageV1Schema = z.object({
  stageId: z.enum([
    'RPC_REQUEST',
    'ANN_QDRANT',
    'ANN_PGVECTOR',
    'ANN_CUVS',
    'ANN_CAGRA',
    'ANN_IVF',
    'ANN_HNSW',
    'ANN_TURBOVEC',
    'CANONICAL_RESOLUTION_RF4',
    'GRAPH_EXPANSION',
    'BOUNDED_QUEUE',
    'RF5_DEDUP',
    'RERANK',
    'TOPK_PAGINATION',
    'CONTEXT_ADMISSION',
  ]),
  required: z.boolean(),
  status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']),
  executorId: z.string().min(1).nullable(),
  executorRevision: z.string().min(1).nullable(),
  indexKind: z.enum(['CUVS_BRUTE_FORCE', 'CAGRA', 'IVF_FLAT', 'IVF_PQ', 'HNSW', 'TURBOVEC']).nullable(),
  indexRevision: z.string().min(1).nullable(),
  configurationChecksum: sha256.nullable(),
  inputChecksum: sha256.nullable(),
  outputChecksum: sha256.nullable(),
  inputCount: nonNegativeInteger,
  outputCount: nonNegativeInteger,
  reasonCode: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict().superRefine((stage, ctx) => {
  if (stage.status === 'PASS' && (!stage.executorId || !stage.executorRevision || !stage.inputChecksum || !stage.outputChecksum)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'PASS_STAGE_REQUIRES_EXECUTOR_AND_CHECKSUMS' });
  }
  if (stage.stageId.startsWith('ANN_') && (!stage.indexKind || !stage.indexRevision || !stage.configurationChecksum)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['indexRevision'], message: 'ANN_STAGE_REQUIRES_INDEX_AND_CONFIGURATION_IDENTITY' });
  }
  if (stage.status !== 'PASS' && !stage.reasonCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonCode'], message: 'NONPASS_STAGE_REQUIRES_REASON' });
  }
  if (stage.outputCount > stage.inputCount && !['ANN_QDRANT', 'ANN_PGVECTOR', 'ANN_CUVS', 'ANN_CAGRA', 'ANN_IVF', 'ANN_HNSW', 'ANN_TURBOVEC', 'GRAPH_EXPANSION'].includes(stage.stageId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outputCount'], message: 'STAGE_OUTPUT_COUNT_EXCEEDS_INPUT_COUNT' });
  }
});

export const CandidateExpansionDecisionV1Schema = z.object({
  packetKey,
  candidateOrdinal: nonNegativeInteger,
  sourceRevision: sha256,
  workspaceRevision: sha256,
  representationRevision: z.string().min(1),
  logicalLane: z.string().min(1),
  rf4: z.enum(['RESOLVED', 'REJECTED']),
  rf5: z.enum(['KEPT', 'DEDUPLICATED', 'REJECTED']),
  duplicateOfPacketKey: packetKey.nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(64),
  reasonCode: z.string().min(1).nullable(),
}).strict().superRefine((decision, ctx) => {
  if (decision.rf4 !== 'RESOLVED' && decision.rf5 === 'KEPT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rf5'], message: 'UNRESOLVED_RF4_CANDIDATE_CANNOT_BE_KEPT' });
  }
  if (decision.rf5 === 'DEDUPLICATED' && !decision.duplicateOfPacketKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duplicateOfPacketKey'], message: 'DEDUPLICATED_CANDIDATE_REQUIRES_WINNER' });
  }
  if (decision.rf5 !== 'DEDUPLICATED' && decision.duplicateOfPacketKey !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duplicateOfPacketKey'], message: 'ONLY_DEDUPLICATED_CANDIDATE_HAS_WINNER' });
  }
  if ((decision.rf4 === 'REJECTED' || decision.rf5 === 'REJECTED' || decision.rf5 === 'DEDUPLICATED') && !decision.reasonCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonCode'], message: 'REJECTED_OR_DEDUPLICATED_CANDIDATE_REQUIRES_REASON' });
  }
});

const fallbackSchema = z.object({
  used: z.boolean(),
  failedExecutorId: z.string().min(1).nullable(),
  selectedExecutorId: z.string().min(1).nullable(),
  reasonCode: z.string().min(1).nullable(),
}).strict();

const receiptBodySchema = z.object({
  schema: z.literal('atlas.candidate-expansion-receipt.v1'),
  requestId: uuidV7,
  requestChecksum: sha256,
  packetKey,
  packetRevisionId: uuidV7,
  sourceRevision: sha256,
  workspaceRevision: sha256,
  representationRevision: z.string().min(1),
  candidateSnapshotChecksum: sha256,
  ordinalMapChecksum: sha256,
  graphRevision: z.string().min(1).nullable(),
  graphSnapshotChecksum: sha256.nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  stages: z.array(CandidateExpansionStageV1Schema).min(1).max(32),
  decisions: z.array(CandidateExpansionDecisionV1Schema).max(2048),
  orderedTopKPacketKeys: z.array(packetKey).max(100),
  fallback: fallbackSchema,
  outcome: z.enum(['SUCCESS', 'SUCCESS_WITH_FALLBACK', 'FAILED', 'BLOCKED', 'NOT_RUN']),
  outputChecksum: sha256,
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((receipt, ctx) => {
  const stageIds = receipt.stages.map((stage) => stage.stageId);
  if (new Set(stageIds).size !== stageIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'DUPLICATE_STAGE_ID' });
  }
  if (receipt.graphRevision === null && receipt.graphSnapshotChecksum !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphSnapshotChecksum'], message: 'GRAPH_CHECKSUM_REQUIRES_GRAPH_REVISION' });
  }
  if (receipt.graphRevision !== null && receipt.graphSnapshotChecksum === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphSnapshotChecksum'], message: 'GRAPH_REVISION_REQUIRES_GRAPH_CHECKSUM' });
  }

  const decisionsByKey = new Map(receipt.decisions.map((decision) => [decision.packetKey, decision]));
  if (decisionsByKey.size !== receipt.decisions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisions'], message: 'DUPLICATE_PACKET_DECISION' });
  }
  const ordinals = receipt.decisions.map((decision) => decision.candidateOrdinal);
  if (new Set(ordinals).size !== ordinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisions'], message: 'DUPLICATE_CANDIDATE_ORDINAL' });
  }
  for (const decision of receipt.decisions) {
    if (decision.workspaceRevision !== receipt.workspaceRevision || decision.representationRevision !== receipt.representationRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisions'], message: 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH' });
      break;
    }
    if (decision.duplicateOfPacketKey === decision.packetKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisions'], message: 'CANDIDATE_CANNOT_DEDUPLICATE_TO_SELF' });
    }
  }
  if (new Set(receipt.orderedTopKPacketKeys).size !== receipt.orderedTopKPacketKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderedTopKPacketKeys'], message: 'DUPLICATE_TOPK_PACKET_KEY' });
  }
  for (const key of receipt.orderedTopKPacketKeys) {
    const decision = decisionsByKey.get(key);
    if (!decision || decision.rf4 !== 'RESOLVED' || decision.rf5 !== 'KEPT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderedTopKPacketKeys'], message: 'TOPK_KEY_NOT_ADMITTED_BY_RF4_RF5' });
      break;
    }
  }

  const requiredFailures = receipt.stages.filter((stage) => stage.required && stage.status !== 'PASS');
  if (receipt.outcome === 'SUCCESS' && requiredFailures.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'SUCCESS_REQUIRES_ALL_REQUIRED_STAGES_PASS' });
  }
  if (receipt.outcome === 'SUCCESS_WITH_FALLBACK') {
    if (!receipt.fallback.used || !receipt.fallback.failedExecutorId || !receipt.fallback.selectedExecutorId || !receipt.fallback.reasonCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallback'], message: 'SUCCESS_WITH_FALLBACK_REQUIRES_FALLBACK_DETAILS' });
    } else {
      const failed = receipt.stages.some((stage) => stage.executorId === receipt.fallback.failedExecutorId && stage.status === 'FAIL');
      const selected = receipt.stages.some((stage) => stage.executorId === receipt.fallback.selectedExecutorId && stage.status === 'PASS');
      if (!failed || !selected) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallback'], message: 'FALLBACK_MUST_PRESERVE_FAILURE_AND_PASSING_EXECUTOR' });
      }
    }
  }
  if (receipt.outcome !== 'SUCCESS_WITH_FALLBACK' && receipt.fallback.used) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallback'], message: 'FALLBACK_OUTCOME_MUST_BE_EXPLICIT' });
  }
  if (receipt.outcome === 'FAILED' && !receipt.stages.some((stage) => stage.status === 'FAIL')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'FAILED_OUTCOME_REQUIRES_FAILED_STAGE' });
  }
  if (receipt.outcome === 'BLOCKED' && !receipt.stages.some((stage) => stage.status === 'BLOCKED')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'BLOCKED_OUTCOME_REQUIRES_BLOCKED_STAGE' });
  }
});

export const CandidateExpansionReceiptV1Schema = receiptBodySchema.extend({ receiptChecksum: sha256 }).strict();
export type CandidateExpansionReceiptV1 = z.infer<typeof CandidateExpansionReceiptV1Schema>;
export type CandidateExpansionReceiptBodyV1 = z.infer<typeof receiptBodySchema>;

function outputChecksum(input: Pick<CandidateExpansionReceiptBodyV1, 'decisions' | 'orderedTopKPacketKeys'>): string {
  const selected = input.orderedTopKPacketKeys.map((key) => input.decisions.find((decision) => decision.packetKey === key));
  return `sha256:${canonicalSha256V1({ orderedTopKPacketKeys: input.orderedTopKPacketKeys, selected })}`;
}

export function buildCandidateExpansionReceiptV1(
  input: Omit<CandidateExpansionReceiptBodyV1, 'schema' | 'outputChecksum' | 'writesPerformed' | 'canonicalAuthority'>,
): CandidateExpansionReceiptV1 {
  const body = receiptBodySchema.parse({
    ...input,
    schema: 'atlas.candidate-expansion-receipt.v1',
    outputChecksum: outputChecksum(input),
    writesPerformed: false,
    canonicalAuthority: false,
  });
  return CandidateExpansionReceiptV1Schema.parse({
    ...body,
    receiptChecksum: `sha256:${canonicalSha256V1(body)}`,
  });
}

export function verifyCandidateExpansionReceiptV1(input: unknown): CandidateExpansionReceiptV1 {
  const receipt = CandidateExpansionReceiptV1Schema.parse(input);
  const { receiptChecksum, ...body } = receipt;
  if (receiptChecksum !== `sha256:${canonicalSha256V1(body)}`) throw new Error('CANDIDATE_EXPANSION_RECEIPT_CHECKSUM_MISMATCH');
  if (receipt.outputChecksum !== outputChecksum(receipt)) throw new Error('CANDIDATE_EXPANSION_OUTPUT_CHECKSUM_MISMATCH');
  return receipt;
}
