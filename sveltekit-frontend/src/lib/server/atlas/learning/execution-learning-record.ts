import { createHash } from 'node:crypto';

export type LearningOutcome = 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PARTIAL' | 'REJECTED';

export interface ExecutionReceiptLike {
  receiptId: string;
  runId: string;
  taskId: string;
  attempt?: number;
  workspaceRevision: string;
  graphRevision?: string | null;
  featureRevision?: string | null;
  representationRevision?: string | null;
  taskFamily: string;
  errorClass?: string | null;
  status: LearningOutcome;
  packetKeys?: string[];
  sourceRefs?: string[];
  evidenceRefs?: string[];
  mutationRefs?: string[];
  validationRefs?: string[];
  toolCallRefs?: string[];
  verifier: {
    schemaValid: boolean;
    provenanceValid: boolean;
    identityStable: boolean;
    executableValidationPassed: boolean;
    replayStable: boolean;
  };
  modelRoute?: {
    baseModelRevision?: string | null;
    adapterRevision?: string | null;
    tokenizerRevision?: string | null;
    promptTemplateRevision?: string | null;
    policyRevision?: string | null;
  } | null;
  costs?: {
    latencyMs?: number | null;
    promptTokens?: number | null;
    generatedTokens?: number | null;
    peakGpuBytes?: number | null;
    peakHostBytes?: number | null;
    toolCalls?: number | null;
  };
}

export interface LearningPrivacyState {
  secretsRedacted: boolean;
  privateRuntimeMaterialRemoved: boolean;
}

export interface ExecutionLearningRecordV1 {
  schema: 'atlas.execution-learning-record.v1';
  recordId: string;
  receiptId: string;
  runId: string;
  taskId: string;
  attempt: number;
  workspaceRevision: string;
  graphRevision: string | null;
  featureRevision: string | null;
  representationRevision: string | null;
  taskFamily: string;
  errorClass: string | null;
  sourceRefs: string[];
  packetKeys: string[];
  evidenceRefs: string[];
  mutationRefs: string[];
  validationRefs: string[];
  toolCallRefs: string[];
  modelRoute: NonNullable<ExecutionReceiptLike['modelRoute']> | null;
  outcome: LearningOutcome;
  verifier: ExecutionReceiptLike['verifier'];
  costs: NonNullable<ExecutionReceiptLike['costs']>;
  eligibility: {
    sftPositive: boolean;
    preference: boolean;
    rewardModel: boolean;
    reinforcementLearning: boolean;
    reasons: string[];
  };
  privacy: LearningPrivacyState & { eligibleForOfflineTraining: boolean };
  emittedAt: string;
  producerRevision: string;
  checksum: string;
}

const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uniq = (values: string[] | undefined) => [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))].sort();

/**
 * Converts a validated execution receipt into an immutable offline-learning view.
 * This function never mutates Kanban, Postgres, model routing, or training state.
 */
export function buildExecutionLearningRecord(
  receipt: ExecutionReceiptLike,
  privacy: LearningPrivacyState,
  options: { emittedAt?: string; producerRevision?: string } = {},
): ExecutionLearningRecordV1 {
  if (!receipt.receiptId || !receipt.runId || !receipt.taskId || !receipt.workspaceRevision) {
    throw new Error('receiptId/runId/taskId/workspaceRevision are required');
  }

  const grounded = receipt.verifier.provenanceValid && receipt.verifier.identityStable;
  const validatedSuccess = receipt.status === 'SUCCESS' && receipt.verifier.executableValidationPassed;
  const privacyReady = privacy.secretsRedacted && privacy.privateRuntimeMaterialRemoved;

  const reasons: string[] = [];
  if (!grounded) reasons.push('GROUNDING_OR_IDENTITY_NOT_PROVEN');
  if (!receipt.verifier.executableValidationPassed) reasons.push('EXECUTABLE_VALIDATION_NOT_PASSED');
  if (!privacyReady) reasons.push('PRIVACY_REDACTION_INCOMPLETE');
  if (receipt.status !== 'SUCCESS') reasons.push(`OUTCOME_${receipt.status}`);

  const sftPositive = validatedSuccess && grounded && privacyReady;
  const negativeOrPreference = ['FAILED', 'PARTIAL', 'REJECTED'].includes(receipt.status) && grounded && privacyReady;
  const rewardModel = (validatedSuccess || negativeOrPreference) && privacyReady;
  const reinforcementLearning = receipt.verifier.replayStable && grounded && privacyReady;

  const body = {
    schema: 'atlas.execution-learning-record.v1' as const,
    recordId: `learning:${receipt.receiptId}`,
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    taskId: receipt.taskId,
    attempt: receipt.attempt ?? 0,
    workspaceRevision: receipt.workspaceRevision,
    graphRevision: receipt.graphRevision ?? null,
    featureRevision: receipt.featureRevision ?? null,
    representationRevision: receipt.representationRevision ?? null,
    taskFamily: receipt.taskFamily,
    errorClass: receipt.errorClass ?? null,
    sourceRefs: uniq(receipt.sourceRefs),
    packetKeys: uniq(receipt.packetKeys),
    evidenceRefs: uniq(receipt.evidenceRefs),
    mutationRefs: uniq(receipt.mutationRefs),
    validationRefs: uniq(receipt.validationRefs),
    toolCallRefs: uniq(receipt.toolCallRefs),
    modelRoute: receipt.modelRoute ?? null,
    outcome: receipt.status,
    verifier: { ...receipt.verifier },
    costs: {
      latencyMs: receipt.costs?.latencyMs ?? null,
      promptTokens: receipt.costs?.promptTokens ?? null,
      generatedTokens: receipt.costs?.generatedTokens ?? null,
      peakGpuBytes: receipt.costs?.peakGpuBytes ?? null,
      peakHostBytes: receipt.costs?.peakHostBytes ?? null,
      toolCalls: receipt.costs?.toolCalls ?? null,
    },
    eligibility: {
      sftPositive,
      preference: negativeOrPreference,
      rewardModel,
      reinforcementLearning,
      reasons: [...new Set(reasons)].sort(),
    },
    privacy: {
      ...privacy,
      eligibleForOfflineTraining: privacyReady && (sftPositive || negativeOrPreference || reinforcementLearning),
    },
    emittedAt: options.emittedAt ?? new Date().toISOString(),
    producerRevision: options.producerRevision ?? 'execution-learning-record-v1',
  };

  return { ...body, checksum: stableHash(body) };
}
