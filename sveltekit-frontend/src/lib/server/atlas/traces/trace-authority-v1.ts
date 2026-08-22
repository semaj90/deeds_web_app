import { createHash } from 'node:crypto';
import { z } from 'zod';

export const TRACE_EXECUTION_SCHEMA = 'atlas.trace-execution.v1' as const;
export const TRACE_CANDIDATE_EVIDENCE_BINDING_SCHEMA = 'atlas.trace-candidate-evidence-binding.v1' as const;
export const TRACE_OUTCOME_RECEIPT_SCHEMA = 'atlas.trace-outcome-receipt.v1' as const;

const nonEmpty = z.string().min(1);
const nullableNonEmpty = nonEmpty.nullable();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
}

export function traceAuthorityChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export const traceExecutionV1Schema = z.object({
  schema: z.literal(TRACE_EXECUTION_SCHEMA),
  traceId: nonEmpty,
  requestId: nonEmpty,
  workflowId: nullableNonEmpty.default(null),
  queryHash: sha256,
  surface: nonEmpty,
  workspaceRevision: nonEmpty,
  graphRevision: nullableNonEmpty.default(null),
  representationRevision: nonEmpty,
  revisionSetHash: sha256,
  startedAt: timestamp,
  finalizedAt: timestamp.nullable().default(null),
  state: z.enum(['OPEN', 'FINALIZED']),
  checksum: sha256,
  identityAuthority: z.literal(false),
  producerRevision: nonEmpty,
}).strict().superRefine((value, ctx) => {
  if (value.state === 'OPEN' && value.finalizedAt !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['finalizedAt'],
      message: 'TRACE_OPEN_CANNOT_HAVE_FINALIZED_AT',
    });
  }
  if (value.state === 'FINALIZED' && value.finalizedAt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['finalizedAt'],
      message: 'TRACE_FINALIZED_REQUIRES_FINALIZED_AT',
    });
  }
});
export type TraceExecutionV1 = z.infer<typeof traceExecutionV1Schema>;

export const traceCandidateEvidenceBindingV1Schema = z.object({
  schema: z.literal(TRACE_CANDIDATE_EVIDENCE_BINDING_SCHEMA),
  traceId: nonEmpty,
  candidateOrdinal: z.number().int().nonnegative().nullable().default(null),
  candidateSnapshotRevision: nullableNonEmpty.default(null),
  packetKey: nonEmpty,
  canonicalId: nonEmpty,
  symbolVersionId: nullableNonEmpty.default(null),
  sourceRef: nonEmpty,
  workspaceRevision: nonEmpty,
  sourceRevision: nonEmpty,
  representationRevision: nonEmpty,
  logicalLane: nonEmpty,
  executor: nonEmpty,
  rawScore: z.number().finite().nullable().default(null),
  normalizedScore: z.number().finite().nullable().default(null),
  rank: z.number().int().nonnegative(),
  retrieved: z.boolean(),
  selected: z.boolean(),
  exactPromoted: z.boolean(),
  usedInContext: z.boolean(),
  executionDependentOnCandidate: z.boolean(),
  evidenceRefs: z.array(nonEmpty),
  bindingChecksum: sha256,
  identityAuthority: z.literal(false),
  producerRevision: nonEmpty,
}).strict().superRefine((value, ctx) => {
  const progression: Array<[boolean, boolean, string]> = [
    [value.selected, value.retrieved, 'TRACE_SELECTED_REQUIRES_RETRIEVED'],
    [value.exactPromoted, value.selected, 'TRACE_EXACT_PROMOTION_REQUIRES_SELECTED'],
    [value.usedInContext, value.exactPromoted, 'TRACE_CONTEXT_USE_REQUIRES_EXACT_PROMOTION'],
    [value.executionDependentOnCandidate, value.usedInContext, 'TRACE_EXECUTION_DEPENDENCY_REQUIRES_CONTEXT_USE'],
  ];
  for (const [later, earlier, message] of progression) {
    if (later && !earlier) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['retrieved'], message });
    }
  }
  if ((value.candidateOrdinal === null) !== (value.candidateSnapshotRevision === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateOrdinal'],
      message: 'TRACE_CANDIDATE_ORDINAL_REQUIRES_SNAPSHOT_REVISION',
    });
  }
});
export type TraceCandidateEvidenceBindingV1 = z.infer<typeof traceCandidateEvidenceBindingV1Schema>;

export const traceOutcomeReceiptV1Schema = z.object({
  schema: z.literal(TRACE_OUTCOME_RECEIPT_SCHEMA),
  receiptId: nonEmpty,
  traceId: nonEmpty,
  executed: z.boolean(),
  finalized: z.literal(true),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILURE', 'ABORTED']),
  downstreamSuccess: z.boolean().nullable().default(null),
  repairSucceeded: z.boolean().nullable().default(null),
  verificationPassed: z.boolean().nullable().default(null),
  resultRef: nullableNonEmpty.default(null),
  failureClass: nullableNonEmpty.default(null),
  errorCode: nullableNonEmpty.default(null),
  latencyMs: z.number().finite().nonnegative().nullable().default(null),
  tokenCost: z.number().finite().nonnegative().nullable().default(null),
  verificationReceiptRefs: z.array(nonEmpty),
  workspaceRevision: nonEmpty,
  graphRevision: nullableNonEmpty.default(null),
  representationRevision: nonEmpty,
  revisionSetHash: sha256,
  finalizedAt: timestamp,
  checksum: sha256,
  producerRevision: nonEmpty,
}).strict().superRefine((value, ctx) => {
  if (!value.executed && value.outcome === 'SUCCESS') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'TRACE_UNEXECUTED_CANNOT_SUCCEED' });
  }
  if (value.repairSucceeded === true && value.verificationPassed !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['repairSucceeded'],
      message: 'TRACE_REPAIR_SUCCESS_REQUIRES_VERIFICATION_PASS',
    });
  }
});
export type TraceOutcomeReceiptV1 = z.infer<typeof traceOutcomeReceiptV1Schema>;

function withChecksum<T extends Record<string, unknown>>(value: T, checksumField: string): T {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== checksumField),
  );
  return { ...value, [checksumField]: traceAuthorityChecksum(payload) } as T;
}

export function materializeTraceExecutionV1(
  input: Omit<z.input<typeof traceExecutionV1Schema>, 'schema' | 'checksum' | 'identityAuthority'>,
): TraceExecutionV1 {
  const withoutChecksum = {
    ...input,
    schema: TRACE_EXECUTION_SCHEMA,
    identityAuthority: false as const,
  };
  return traceExecutionV1Schema.parse(withChecksum({ ...withoutChecksum, checksum: '' }, 'checksum'));
}

export function materializeTraceCandidateEvidenceBindingV1(
  input: Omit<z.input<typeof traceCandidateEvidenceBindingV1Schema>, 'schema' | 'bindingChecksum' | 'identityAuthority'>,
): TraceCandidateEvidenceBindingV1 {
  const withoutChecksum = {
    ...input,
    schema: TRACE_CANDIDATE_EVIDENCE_BINDING_SCHEMA,
    identityAuthority: false as const,
  };
  return traceCandidateEvidenceBindingV1Schema.parse(
    withChecksum({ ...withoutChecksum, bindingChecksum: '' }, 'bindingChecksum'),
  );
}

export function materializeTraceOutcomeReceiptV1(
  input: Omit<z.input<typeof traceOutcomeReceiptV1Schema>, 'schema' | 'checksum' | 'finalized'>,
): TraceOutcomeReceiptV1 {
  const withoutChecksum = {
    ...input,
    schema: TRACE_OUTCOME_RECEIPT_SCHEMA,
    finalized: true as const,
  };
  return traceOutcomeReceiptV1Schema.parse(withChecksum({ ...withoutChecksum, checksum: '' }, 'checksum'));
}
