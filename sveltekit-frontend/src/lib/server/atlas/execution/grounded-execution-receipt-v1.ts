import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

const GroundingRefsSchema = z.object({
  packetKeys: z.array(id).default([]),
  processIds: z.array(id).default([]),
  sourceRefs: z.array(id).min(1),
  evidenceRefs: z.array(id).min(1),
}).strict();

export const GroundedContextManifestV1Schema = z.object({
  schema: z.literal('atlas.grounded-context-manifest.v1'),
  taskId: id,
  runId: id,
  workerId: id,
  contextManifestSchema: z.literal('atlas.context-manifest.v1'),
  contextManifestChecksum: checksum,
  requestId: id,
  snapshotId: id,
  graphRevision: id.nullable(),
  producerRevision: id,
  grounding: GroundingRefsSchema,
  canonicalAuthority: z.literal(false),
}).strict();

export const GroundedValidationObservationV1Schema = z.object({
  validationId: id,
  command: id,
  status: z.enum(['PASSED', 'FAILED', 'ERROR', 'SKIPPED']),
  exitCode: z.number().int().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  evidenceRefs: z.array(id).default([]),
  outputDigest: checksum.nullable(),
}).strict();

export const GroundedExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.grounded-execution-receipt.v1'),
  receiptId: id,
  taskId: id,
  runId: id,
  workerId: id,
  claimTokenDigest: checksum,
  groundedContextChecksum: checksum,
  contextManifestChecksum: checksum,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: z.enum(['SUCCESS', 'FAILED', 'BLOCKED', 'PARTIAL']),
  executor: z.enum(['codex', 'claude-code', 'opencode', 'local', 'other']),
  executorRevision: id,
  mutationRefs: z.array(id).default([]),
  outputRefs: z.array(id).default([]),
  validation: z.array(GroundedValidationObservationV1Schema),
  evidenceRefs: z.array(id).min(1),
  canonicalAuthority: z.literal(false),
  receiptChecksum: checksum,
}).strict();

export type GroundedContextManifestV1 = z.infer<typeof GroundedContextManifestV1Schema>;
export type GroundedExecutionReceiptV1 = z.infer<typeof GroundedExecutionReceiptV1Schema>;
export type GroundedValidationObservationV1 = z.infer<typeof GroundedValidationObservationV1Schema>;

type GroundedExecutionReceiptBuildInput = Omit<
  GroundedExecutionReceiptV1,
  'schema' | 'canonicalAuthority' | 'receiptChecksum'
>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256GroundedExecutionValue(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function digestClaimTokenV1(claimToken: string): string {
  if (!claimToken.trim()) throw new Error('CLAIM_TOKEN_REQUIRED');
  return createHash('sha256').update(claimToken, 'utf8').digest('hex');
}

export function buildGroundedContextManifestV1(input: Omit<GroundedContextManifestV1, 'schema' | 'canonicalAuthority'>): GroundedContextManifestV1 {
  const parsed = GroundedContextManifestV1Schema.parse({
    schema: 'atlas.grounded-context-manifest.v1',
    ...input,
    canonicalAuthority: false,
  });
  const refs = [
    ...parsed.grounding.packetKeys,
    ...parsed.grounding.processIds,
    ...parsed.grounding.sourceRefs,
    ...parsed.grounding.evidenceRefs,
  ];
  if (refs.some((ref) => !ref.trim())) throw new Error('GROUNDING_REF_EMPTY');
  return parsed;
}

export function checksumGroundedContextManifestV1(manifest: GroundedContextManifestV1): string {
  return sha256GroundedExecutionValue(GroundedContextManifestV1Schema.parse(manifest));
}

function sanitizeReceiptBuildInput(input: GroundedExecutionReceiptBuildInput): GroundedExecutionReceiptBuildInput {
  // Runtime callers may spread a previously persisted receipt back into the
  // builder despite the TypeScript Omit<> contract. Strip envelope/checksum
  // fields defensively so an old checksum can never become part of the new
  // checksum preimage.
  const value = { ...(input as GroundedExecutionReceiptBuildInput & Record<string, unknown>) };
  delete value.schema;
  delete value.canonicalAuthority;
  delete value.receiptChecksum;
  return value as GroundedExecutionReceiptBuildInput;
}

export function buildGroundedExecutionReceiptV1(input: GroundedExecutionReceiptBuildInput): GroundedExecutionReceiptV1 {
  const cleanInput = sanitizeReceiptBuildInput(input);
  const payload = {
    schema: 'atlas.grounded-execution-receipt.v1' as const,
    ...cleanInput,
    canonicalAuthority: false as const,
  };

  if (cleanInput.status === 'SUCCESS') {
    const passed = cleanInput.validation.filter((item) => item.status === 'PASSED');
    if (passed.length === 0) throw new Error('EXECUTION_SUCCESS_REQUIRES_PASSED_VALIDATION');
    if (cleanInput.validation.some((item) => item.status === 'FAILED' || item.status === 'ERROR')) {
      throw new Error('EXECUTION_SUCCESS_CONFLICTS_WITH_FAILED_VALIDATION');
    }
  }

  const receiptChecksum = sha256GroundedExecutionValue(payload);
  return GroundedExecutionReceiptV1Schema.parse({ ...payload, receiptChecksum });
}

export function verifyGroundedExecutionReceiptChecksumV1(receipt: GroundedExecutionReceiptV1): boolean {
  const parsed = GroundedExecutionReceiptV1Schema.parse(receipt);
  const { receiptChecksum, ...payload } = parsed;
  return sha256GroundedExecutionValue(payload) === receiptChecksum;
}

export function validateGroundedExecutionReceiptV1(input: {
  receipt: GroundedExecutionReceiptV1;
  groundedContext: GroundedContextManifestV1;
  currentTask: {
    taskId: string;
    currentRunId: string | null;
    assignee: string | null;
    claimToken: string | null;
  };
}): { ok: true } | { ok: false; blockers: string[] } {
  const receipt = GroundedExecutionReceiptV1Schema.parse(input.receipt);
  const context = GroundedContextManifestV1Schema.parse(input.groundedContext);
  const blockers: string[] = [];

  if (!verifyGroundedExecutionReceiptChecksumV1(receipt)) blockers.push('RECEIPT_CHECKSUM_MISMATCH');
  if (receipt.taskId !== context.taskId || receipt.taskId !== input.currentTask.taskId) blockers.push('TASK_ID_MISMATCH');
  if (receipt.runId !== context.runId || receipt.runId !== input.currentTask.currentRunId) blockers.push('RUN_ID_MISMATCH');
  if (receipt.workerId !== context.workerId || receipt.workerId !== input.currentTask.assignee) blockers.push('WORKER_ID_MISMATCH');
  if (!input.currentTask.claimToken || receipt.claimTokenDigest !== digestClaimTokenV1(input.currentTask.claimToken)) blockers.push('CLAIM_TOKEN_MISMATCH');

  const groundedContextChecksum = checksumGroundedContextManifestV1(context);
  if (receipt.groundedContextChecksum !== groundedContextChecksum) blockers.push('GROUNDED_CONTEXT_CHECKSUM_MISMATCH');
  if (receipt.contextManifestChecksum !== context.contextManifestChecksum) blockers.push('CONTEXT_MANIFEST_CHECKSUM_MISMATCH');

  const contextEvidence = new Set(context.grounding.evidenceRefs);
  if (receipt.evidenceRefs.some((ref) => !contextEvidence.has(ref))) blockers.push('EXECUTION_EVIDENCE_NOT_GROUNDED');

  if (receipt.status === 'SUCCESS') {
    if (!receipt.validation.some((item) => item.status === 'PASSED')) blockers.push('SUCCESS_WITHOUT_PASSED_VALIDATION');
    if (receipt.validation.some((item) => item.status === 'FAILED' || item.status === 'ERROR')) blockers.push('SUCCESS_WITH_FAILED_VALIDATION');
  }

  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
