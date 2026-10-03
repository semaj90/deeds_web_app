import { z } from 'zod';
import { canonicalHashJSON } from './canonical-hashing.js';

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const EvidenceTypeV1Schema = z.enum([
  'STATIC',
  'TEST',
  'EXECUTION',
  'DATABASE',
  'PROJECTION',
  'READBACK',
  'NEGATIVE',
  'APPROVAL',
]);

export const EvidenceVerdictV1Schema = z.enum(['PROVEN', 'PARTIAL', 'BLOCKED', 'FAILED', 'STALE']);
export const ProofStateV1Schema = z.enum(['CLAIM_ONLY', 'PARTIAL', 'PROVEN', 'BLOCKED', 'FAILED', 'STALE']);

export const EvidenceRefV1Schema = z.object({
  kind: z.string().min(1),
  uri: z.string().min(1),
  checksum: sha256Schema.optional(),
  sourceRef: z.string().min(1).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.lineStart !== undefined && value.lineEnd !== undefined && value.lineEnd < value.lineStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineEnd'], message: 'lineEnd must not precede lineStart' });
  }
});

export const AssertionResultV1Schema = z.object({
  id: z.string().min(1),
  expected: z.string().min(1),
  actual: z.string().min(1),
  passed: z.boolean(),
});

export const ExpectedAssertionV1Schema = z.object({
  id: z.string().min(1),
  expected: z.string().min(1),
});

export const ActualAssertionV1Schema = z.object({
  id: z.string().min(1),
  actual: z.string().min(1),
  passed: z.boolean(),
});

export const EvidenceSourceRefV1Schema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  byteStart: z.number().int().nonnegative().optional(),
  byteEnd: z.number().int().nonnegative().optional(),
  sourceRevision: sha256Schema,
  checksum: sha256Schema.optional(),
}).superRefine((value, context) => {
  const hasLineSpan = value.lineStart !== undefined && value.lineEnd !== undefined;
  const hasByteSpan = value.byteStart !== undefined && value.byteEnd !== undefined;
  if (!hasLineSpan && !hasByteSpan) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineStart'], message: 'source reference requires a complete line or byte span' });
  }
  if (value.lineStart !== undefined && value.lineEnd !== undefined && value.lineEnd < value.lineStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lineEnd'], message: 'lineEnd must not precede lineStart' });
  }
  if (value.byteStart !== undefined && value.byteEnd !== undefined && value.byteEnd < value.byteStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['byteEnd'], message: 'byteEnd must not precede byteStart' });
  }
});

const EvidenceReceiptV1UnsignedSchema = z.object({
  schema: z.literal('atlas.evidence-receipt.v1'),
  evidenceId: z.string().min(1),
  evidenceType: EvidenceTypeV1Schema,
  changeId: z.string().min(1),
  taskId: z.string().min(1),
  claim: z.string().min(1),
  gitCommit: z.string().min(1).optional(),
  workspaceRevision: sha256Schema,
  sourceRevision: sha256Schema,
  sourceRefs: z.array(EvidenceSourceRefV1Schema).min(1),
  environmentFingerprint: sha256Schema,
  graphRevision: z.string().min(1).optional(),
  representationRevision: z.string().min(1).optional(),
  producer: z.string().min(1),
  command: z.string().min(1).optional(),
  inputs: z.array(EvidenceRefV1Schema),
  observedAt: z.string().datetime({ offset: true }),
  exitCode: z.number().int().optional(),
  expectedAssertions: z.array(ExpectedAssertionV1Schema).min(1),
  actualAssertions: z.array(ActualAssertionV1Schema).min(1),
  outputs: z.array(EvidenceRefV1Schema),
  verifier: z.string().min(1).optional(),
  independentVerifier: z.string().min(1).optional(),
  supersedesEvidenceId: z.string().min(1).optional(),
  staleReason: z.string().min(1).optional(),
  readbackRequired: z.boolean(),
  readbackPerformed: z.boolean(),
  readbackCommand: z.string().min(1).optional(),
  verdict: EvidenceVerdictV1Schema,
});

export const EvidenceReceiptV1Schema = EvidenceReceiptV1UnsignedSchema.extend({
  checksum: sha256Schema,
}).superRefine((value, context) => {
  const { checksum: _checksum, ...unsigned } = value;
  const expected = `sha256:${canonicalHashJSON(unsigned)}`;
  if (value.checksum !== expected) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'EvidenceReceiptV1 checksum mismatch' });
  }
  const expectedIds = value.expectedAssertions.map((assertion) => assertion.id);
  const actualIds = value.actualAssertions.map((assertion) => assertion.id);
  if (new Set(expectedIds).size !== expectedIds.length || new Set(actualIds).size !== actualIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actualAssertions'], message: 'assertion IDs must be unique' });
  }
  if (expectedIds.length !== actualIds.length || expectedIds.some((id) => !actualIds.includes(id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actualAssertions'], message: 'actual assertions must cover every expected assertion exactly once' });
  }
  if (value.verdict === 'PROVEN' && value.actualAssertions.some((assertion) => !assertion.passed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['verdict'], message: 'PROVEN receipt contains an unsatisfied assertion' });
  }
  if (value.verdict === 'PROVEN' && !value.independentVerifier) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['independentVerifier'], message: 'PROVEN receipt requires an independent verifier' });
  }
  if (value.verdict === 'PROVEN' && value.readbackRequired && !value.readbackPerformed) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readbackPerformed'], message: 'PROVEN receipt requires the requested readback' });
  }
  if (value.verdict === 'STALE' && !value.staleReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['staleReason'], message: 'STALE receipt requires a stale reason' });
  }
});

export type EvidenceTypeV1 = z.infer<typeof EvidenceTypeV1Schema>;
export type EvidenceVerdictV1 = z.infer<typeof EvidenceVerdictV1Schema>;
export type EvidenceRefV1 = z.infer<typeof EvidenceRefV1Schema>;
export type AssertionResultV1 = z.infer<typeof AssertionResultV1Schema>;
export type ExpectedAssertionV1 = z.infer<typeof ExpectedAssertionV1Schema>;
export type ActualAssertionV1 = z.infer<typeof ActualAssertionV1Schema>;
export type EvidenceSourceRefV1 = z.infer<typeof EvidenceSourceRefV1Schema>;
export type EvidenceReceiptV1 = z.infer<typeof EvidenceReceiptV1Schema>;

export function buildEvidenceReceiptV1(input: z.input<typeof EvidenceReceiptV1UnsignedSchema>): EvidenceReceiptV1 {
  const unsigned = EvidenceReceiptV1UnsignedSchema.parse(input);
  return EvidenceReceiptV1Schema.parse({ ...unsigned, checksum: `sha256:${canonicalHashJSON(unsigned)}` });
}

export function verifyEvidenceReceiptV1(receipt: unknown): EvidenceReceiptV1 {
  return EvidenceReceiptV1Schema.parse(receipt);
}

export type ProofStateV1 = z.infer<typeof ProofStateV1Schema>;

export function deriveOpenSpecProofState(input: {
  declaredChecked: boolean;
  currentWorkspaceRevision: string;
  currentSourceRevision: string;
  receipts: readonly EvidenceReceiptV1[];
}): ProofStateV1 {
  const current = input.receipts.filter((receipt) => receipt.workspaceRevision === input.currentWorkspaceRevision && receipt.sourceRevision === input.currentSourceRevision);
  if (current.some((receipt) => receipt.verdict === 'FAILED')) return 'FAILED';
  if (current.some((receipt) => receipt.verdict === 'BLOCKED')) return 'BLOCKED';
  if (current.some((receipt) => receipt.verdict === 'PROVEN')) return 'PROVEN';
  if (current.some((receipt) => receipt.verdict === 'PARTIAL')) return 'PARTIAL';
  if (current.some((receipt) => receipt.verdict === 'STALE')) return 'STALE';
  if (input.receipts.length > 0) return 'STALE';
  return 'CLAIM_ONLY';
}

const EvidenceCardV1UnsignedSchema = z.object({
  schema: z.literal('atlas.evidence-card.v1'),
  taskRef: z.string().min(1),
  changeId: z.string().min(1),
  taskId: z.string().min(1),
  claim: z.string().min(1),
  proofState: z.union([EvidenceVerdictV1Schema, z.literal('CLAIM_ONLY')]),
  retrievalUsable: z.boolean().default(true),
  proofUsable: z.boolean().default(false),
  rejectionReasons: z.array(z.string().min(1)).default([]),
  sourceRef: z.string().min(1),
  conceptID: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  contextBlob: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  workspaceRevision: z.string().min(1),
});

export const EvidenceCardV1Schema = EvidenceCardV1UnsignedSchema.extend({ checksum: sha256Schema }).superRefine((value, context) => {
  const { checksum: _checksum, ...unsigned } = value;
  if (value.checksum !== `sha256:${canonicalHashJSON(unsigned)}`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'EvidenceCardV1 checksum mismatch' });
  }
  if (value.proofUsable && value.proofState !== 'PROVEN') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['proofUsable'], message: 'proofUsable requires PROVEN proofState' });
  }
  if (value.proofUsable && !value.retrievalUsable) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['proofUsable'], message: 'proofUsable requires retrievalUsable' });
  }
});

export type EvidenceCardV1 = z.infer<typeof EvidenceCardV1Schema>;

export function buildEvidenceCardV1(input: z.input<typeof EvidenceCardV1UnsignedSchema>): EvidenceCardV1 {
  const unsigned = EvidenceCardV1UnsignedSchema.parse(input);
  return EvidenceCardV1Schema.parse({ ...unsigned, checksum: `sha256:${canonicalHashJSON(unsigned)}` });
}
