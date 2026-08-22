import { createHash } from 'node:crypto';
import { z } from 'zod';

export const OperationKindV1Schema = z.enum(['READ', 'AUDIT', 'PROPOSE', 'APPLY']);
export type OperationKindV1 = z.infer<typeof OperationKindV1Schema>;

export const OrchestrationStageV1Schema = z.enum([
  'QUERY_CLASSIFICATION',
  'PREFILL',
  'TOOL_SELECTION',
  'RETRIEVAL',
  'EXACT_PROMOTION',
  'TOOL_EXECUTION',
  'VALIDATION',
  'SYNTHESIS',
  'MATERIALIZATION',
]);
export type OrchestrationStageV1 = z.infer<typeof OrchestrationStageV1Schema>;

export const AdvisoryDecoderStateV1Schema = z.object({
  source: z.enum(['NONE', 'FSM', 'HMM', 'VITERBI', 'HMM_VITERBI']),
  state: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(256),
  authorizesExecution: z.literal(false),
}).strict();
export type AdvisoryDecoderStateV1 = z.infer<typeof AdvisoryDecoderStateV1Schema>;

export const LlmPrefillEnvelopeV1Schema = z.object({
  schema: z.literal('atlas.llm-prefill-envelope.v1'),
  modelProvider: z.string().min(1),
  modelId: z.string().min(1),
  endpoint: z.string().url(),
  contextWindowTokens: z.number().int().positive(),
  reservedOutputTokens: z.number().int().nonnegative(),
  toolSchemaBudgetTokens: z.number().int().nonnegative(),
  evidenceBudgetTokens: z.number().int().nonnegative(),
  instructionBudgetTokens: z.number().int().nonnegative(),
  selectedToolIds: z.array(z.string().min(1)).max(64),
  selectedEvidenceRefs: z.array(z.string().min(1)).max(4096),
  packetManifestChecksum: z.string().length(64).nullable(),
  routingReceiptChecksum: z.string().length(64),
  cacheKey: z.string().min(1),
  cacheable: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const used = value.reservedOutputTokens + value.toolSchemaBudgetTokens + value.evidenceBudgetTokens + value.instructionBudgetTokens;
  if (used > value.contextWindowTokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contextWindowTokens'],
      message: 'prefill token budgets exceed model context window',
    });
  }
});
export type LlmPrefillEnvelopeV1 = z.infer<typeof LlmPrefillEnvelopeV1Schema>;

export const PrefillExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.prefill-execution-plan.v1'),
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  userQuery: z.string().min(1),
  queryHash: z.string().length(64),
  queryIntent: z.enum(['SEARCH', 'READ', 'ANALYZE', 'PLAN', 'EDIT', 'VERIFY', 'SYNTHESIZE', 'UNKNOWN']),
  allowedOperationKinds: z.array(OperationKindV1Schema).min(1).max(4),
  mutationAuthorized: z.boolean(),
  humanApprovalPresent: z.boolean(),
  selectedToolIds: z.array(z.string().min(1)).max(64),
  selectedDagNodeIds: z.array(z.string().min(1)).max(256),
  requiredStages: z.array(OrchestrationStageV1Schema).min(1).max(16),
  advisoryDecoder: AdvisoryDecoderStateV1Schema,
  prefill: LlmPrefillEnvelopeV1Schema,
  exactPromotionRequired: z.boolean(),
  validationRequired: z.boolean(),
  canonicalWritesAllowed: z.boolean(),
  producerRevision: z.string().min(1),
  checksum: z.string().length(64),
}).strict().superRefine((value, ctx) => {
  const applyAllowed = value.allowedOperationKinds.includes('APPLY');
  if (applyAllowed && !value.mutationAuthorized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutationAuthorized'], message: 'APPLY requires mutationAuthorized=true' });
  }
  if (value.canonicalWritesAllowed && (!applyAllowed || !value.mutationAuthorized || !value.humanApprovalPresent)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['canonicalWritesAllowed'],
      message: 'canonical writes require APPLY + mutation authorization + human approval',
    });
  }
  if (value.prefill.selectedToolIds.join('\0') !== value.selectedToolIds.join('\0')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prefill', 'selectedToolIds'], message: 'prefill selected tools must exactly match plan selected tools' });
  }
});
export type PrefillExecutionPlanV1 = z.infer<typeof PrefillExecutionPlanV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function orchestrationChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function createPrefillExecutionPlanV1(
  input: Omit<PrefillExecutionPlanV1, 'schema' | 'queryHash' | 'checksum'>,
): PrefillExecutionPlanV1 {
  const withoutChecksum = {
    ...input,
    schema: 'atlas.prefill-execution-plan.v1' as const,
    queryHash: orchestrationChecksum(input.userQuery),
  };
  const parsed = PrefillExecutionPlanV1Schema.omit({ checksum: true }).parse(withoutChecksum);
  return PrefillExecutionPlanV1Schema.parse({
    ...parsed,
    checksum: orchestrationChecksum(parsed),
  });
}

export function assertToolNominationAllowed(input: {
  plan: PrefillExecutionPlanV1;
  toolId: string;
  operationKind: OperationKindV1;
}): void {
  const plan = PrefillExecutionPlanV1Schema.parse(input.plan);
  if (!plan.selectedToolIds.includes(input.toolId)) {
    throw new Error(`TOOL_NOT_PREFILL_AUTHORIZED:${input.toolId}`);
  }
  if (!plan.allowedOperationKinds.includes(input.operationKind)) {
    throw new Error(`OPERATION_KIND_NOT_AUTHORIZED:${input.operationKind}`);
  }
  if (input.operationKind === 'APPLY' && !plan.canonicalWritesAllowed) {
    throw new Error('APPLY_BLOCKED_BY_PREFILL_PLAN');
  }
}
