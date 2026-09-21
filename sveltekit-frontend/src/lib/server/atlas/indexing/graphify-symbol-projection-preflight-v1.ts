import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GraphifyStructuralIntelligenceReceipt } from './graphify-structural-intelligence-adapter.js';
import type { GraphifySymbolProjectionBatchV1 } from './graphify-symbol-projection-v1.js';

const nonEmpty = z.string().min(1);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const GRAPHIFY_SYMBOL_PROJECTION_PREFLIGHT_V1 =
  'atlas.graphify-symbol-projection-preflight.2026-09-12.v1' as const;

export const graphifySymbolProjectionPreflightStatusV1Schema = z.enum([
  'READY',
  'BLOCKED_WORKSPACE_REVISION',
  'BLOCKED_TERMINAL_RUN_OWNER',
  'BLOCKED_SOURCE_BINDING',
  'BLOCKED_SOURCE_REVISION',
  'BLOCKED_NON_NATIVE_PROVENANCE',
  'BLOCKED_DUPLICATE_SYMBOL_KEY',
  'BLOCKED_INVALID_SPAN',
  'BLOCKED_AST_FINGERPRINT_MISSING',
]);

export type GraphifySymbolProjectionPreflightStatusV1 = z.infer<
  typeof graphifySymbolProjectionPreflightStatusV1Schema
>;

/**
 * Explicit run-owner evidence. A completed coordinator stage is intentionally
 * insufficient: the writer gate requires a terminal execution binding whose
 * canonical_authority was independently read back as true.
 */
export const graphifySymbolProjectionRunOwnerEvidenceV1Schema = z.object({
  expectedWorkspaceRevision: nonEmpty,
  runId: uuid.nullable(),
  executionId: uuid.nullable(),
  workspaceId: uuid.nullable(),
  runWorkspaceRevision: nonEmpty.nullable(),
  runCompleted: z.boolean(),
  terminalExecutionBound: z.boolean(),
  canonicalAuthority: z.boolean(),
  workspaceForeignRowExists: z.boolean(),
  sourceManifestBound: z.boolean(),
  readbackVerified: z.boolean(),
  coordinatorCompletedStageCount: z.number().int().nonnegative().default(0),
}).strict();

export type GraphifySymbolProjectionRunOwnerEvidenceV1 = z.infer<
  typeof graphifySymbolProjectionRunOwnerEvidenceV1Schema
>;

/** Exact readback of the graphify_files row that owns this source version. */
export const graphifySymbolProjectionSourceBindingV1Schema = z.object({
  fileId: uuid,
  workspaceId: uuid,
  workspaceRevision: nonEmpty,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  contentDigest: sha256,
  byteLength: z.number().int().nonnegative(),
  readbackVerified: z.literal(true),
}).strict();

export type GraphifySymbolProjectionSourceBindingV1 = z.infer<
  typeof graphifySymbolProjectionSourceBindingV1Schema
>;

/**
 * Narrow view of GraphifyStructuralIntelligenceReceipt used by the preflight.
 * Keeping this as its own schema makes the boundary serializable/testable while
 * remaining assignable from the live adapter receipt.
 */
export const graphifySymbolProjectionStructuralEvidenceV1Schema = z.object({
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty.nullable(),
  sourceRevisionAuthority: nonEmpty,
  workspaceRevision: nonEmpty,
  status: z.enum(['COMPILED_NATIVE', 'COMPILED_NONPROMOTABLE', 'SKIPPED_NO_EVIDENCE']),
  providerStatus: nonEmpty,
  provenanceStatus: nonEmpty,
  strictNativeMode: z.boolean(),
  canonicalPromotionMayBeAttempted: z.boolean(),
  compatibilityNodeIdCount: z.number().int().nonnegative(),
  compatibilityFileIdCount: z.number().int().nonnegative(),
  compatibilityChunkIdCount: z.number().int().nonnegative(),
  canonicalIdentityCreated: z.literal(false),
  // Narrow VIEW of a wider live receipt: unknown keys (sourceVersionAnchor, counts, diagnostics, ...)
  // are stripped, not rejected. Every field the gate reasons about stays required and typed.
}).strip();

export type GraphifySymbolProjectionStructuralEvidenceV1 = z.infer<
  typeof graphifySymbolProjectionStructuralEvidenceV1Schema
>;

const preflightChecksSchema = z.object({
  workspaceRevisionMatches: z.boolean(),
  terminalRunOwnerProven: z.boolean(),
  sourceBindingMatches: z.boolean(),
  sourceRevisionMatches: z.boolean(),
  nativeProvenanceProven: z.boolean(),
  duplicateSymbolKeyCountZero: z.boolean(),
  spansValid: z.boolean(),
  astFingerprintsPresent: z.boolean(),
}).strict();

export const graphifySymbolProjectionPreflightReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-symbol-projection-preflight.v1'),
  gate: z.literal('SYMBOL-PROJECTION-PREFLIGHT-01'),
  status: graphifySymbolProjectionPreflightStatusV1Schema,
  readyForWriter: z.boolean(),
  writerMayBeAttempted: z.boolean(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  admittedWorkspaceRevision: nonEmpty,
  workspaceId: uuid,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  runId: uuid.nullable(),
  executionId: uuid.nullable(),
  checks: preflightChecksSchema,
  counts: z.object({
    symbolCandidateCount: z.number().int().nonnegative(),
    edgeCandidateCount: z.number().int().nonnegative(),
    duplicateSymbolKeyCount: z.number().int().nonnegative(),
    invalidSpanCount: z.number().int().nonnegative(),
    missingAstFingerprintCount: z.number().int().nonnegative(),
  }).strict(),
  violations: z.array(nonEmpty),
  inputChecksum: sha256,
  receiptChecksum: sha256,
  producerRevision: z.literal(GRAPHIFY_SYMBOL_PROJECTION_PREFLIGHT_V1),
}).strict();

export type GraphifySymbolProjectionPreflightReceiptV1 = z.infer<
  typeof graphifySymbolProjectionPreflightReceiptV1Schema
>;

export type GraphifySymbolProjectionPreflightInputV1 = {
  admittedWorkspaceRevision: string;
  batch: GraphifySymbolProjectionBatchV1;
  runOwner: GraphifySymbolProjectionRunOwnerEvidenceV1;
  sourceBinding: GraphifySymbolProjectionSourceBindingV1;
  structuralReceipt: GraphifyStructuralIntelligenceReceipt | GraphifySymbolProjectionStructuralEvidenceV1;
};

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countDuplicateSymbolKeys(batch: GraphifySymbolProjectionBatchV1): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const symbol of batch.symbols) {
    const key = `${symbol.fileId}\0${symbol.stableSymbolKey}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates.size;
}

function countMissingAstFingerprints(batch: GraphifySymbolProjectionBatchV1): number {
  return batch.symbols.filter((symbol) => {
    const value = (symbol as { astFingerprint?: unknown }).astFingerprint;
    return typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value);
  }).length;
}

function countInvalidSpans(batch: GraphifySymbolProjectionBatchV1, byteLength: number): number {
  let count = 0;
  for (const symbol of batch.symbols) {
    if (
      !Number.isInteger(symbol.startByte)
      || !Number.isInteger(symbol.endByte)
      || !Number.isInteger(symbol.startRow)
      || !Number.isInteger(symbol.endRow)
      || symbol.startByte < 0
      || symbol.endByte < symbol.startByte
      || symbol.endByte > byteLength
      || symbol.startRow < 0
      || symbol.endRow < symbol.startRow
    ) {
      count += 1;
    }
  }
  for (const edge of batch.edges) {
    const span = edge.evidenceSpan;
    if (
      !Number.isInteger(span.startByte)
      || !Number.isInteger(span.endByte)
      || !Number.isInteger(span.startRow)
      || !Number.isInteger(span.endRow)
      || span.startByte < 0
      || span.endByte < span.startByte
      || span.endByte > byteLength
      || span.startRow < 0
      || span.endRow < span.startRow
    ) {
      count += 1;
    }
  }
  return count;
}

function allCandidateBindingsMatch(batch: GraphifySymbolProjectionBatchV1): boolean {
  const expectedSource = normalizeSourceRef(batch.sourceRef);
  return batch.symbols.every((symbol) =>
    symbol.fileId === batch.fileId
    && symbol.workspaceRevision === batch.workspaceRevision
    && normalizeSourceRef(symbol.sourceRef) === expectedSource
    && symbol.sourceRevision === batch.sourceRevision)
    && batch.edges.every((edge) =>
      edge.workspaceId === batch.workspaceId
      && edge.workspaceRevision === batch.workspaceRevision
      && normalizeSourceRef(edge.sourceRef) === expectedSource
      && edge.sourceRevision === batch.sourceRevision);
}

/**
 * GSP-3 read-only authority preflight.
 *
 * This function never performs persistence. READY means only that a later
 * transactional writer may be attempted with this exact evidence set. It does
 * not mint canonical authority, graph revision, representation revision, or any
 * other downstream promotion decision.
 */
export function proveGraphifySymbolProjectionPreflightV1(
  input: GraphifySymbolProjectionPreflightInputV1,
): GraphifySymbolProjectionPreflightReceiptV1 {
  const admittedWorkspaceRevision = nonEmpty.parse(input.admittedWorkspaceRevision);
  const runOwner = graphifySymbolProjectionRunOwnerEvidenceV1Schema.parse(input.runOwner);
  const sourceBinding = graphifySymbolProjectionSourceBindingV1Schema.parse(input.sourceBinding);
  const structuralReceipt = graphifySymbolProjectionStructuralEvidenceV1Schema.parse(input.structuralReceipt);
  const batch = input.batch;

  const normalizedBatchSource = normalizeSourceRef(batch.sourceRef);
  const normalizedBindingSource = normalizeSourceRef(sourceBinding.sourceRef);
  const normalizedStructuralSource = normalizeSourceRef(structuralReceipt.sourceRef);

  const workspaceRevisionMatches =
    batch.workspaceRevision === admittedWorkspaceRevision
    && sourceBinding.workspaceRevision === admittedWorkspaceRevision
    && structuralReceipt.workspaceRevision === admittedWorkspaceRevision
    && runOwner.expectedWorkspaceRevision === admittedWorkspaceRevision
    && (runOwner.runWorkspaceRevision === null || runOwner.runWorkspaceRevision === admittedWorkspaceRevision);

  const terminalRunOwnerProven = Boolean(
    runOwner.runId
    && runOwner.executionId
    && runOwner.workspaceId === batch.workspaceId
    && runOwner.runWorkspaceRevision === admittedWorkspaceRevision
    && runOwner.runCompleted
    && runOwner.terminalExecutionBound
    && runOwner.canonicalAuthority
    && runOwner.workspaceForeignRowExists
    && runOwner.sourceManifestBound
    && runOwner.readbackVerified
  );

  const sourceBindingMatches =
    sourceBinding.fileId === batch.fileId
    && sourceBinding.workspaceId === batch.workspaceId
    && normalizedBindingSource === normalizedBatchSource
    && sourceBinding.readbackVerified
    && allCandidateBindingsMatch(batch);

  const sourceRevisionMatches =
    sourceBinding.sourceRevision === batch.sourceRevision
    && structuralReceipt.sourceRevision === batch.sourceRevision;

  const nativeProvenanceProven =
    structuralReceipt.sourceRevisionAuthority === 'PROVEN'
    && structuralReceipt.status === 'COMPILED_NATIVE'
    && structuralReceipt.provenanceStatus === 'NATIVE_READY'
    && structuralReceipt.strictNativeMode
    && structuralReceipt.canonicalPromotionMayBeAttempted
    && structuralReceipt.compatibilityNodeIdCount === 0
    && structuralReceipt.compatibilityFileIdCount === 0
    && structuralReceipt.compatibilityChunkIdCount === 0
    && structuralReceipt.canonicalIdentityCreated === false
    && normalizedStructuralSource === normalizedBatchSource;

  const duplicateSymbolKeyCount = countDuplicateSymbolKeys(batch);
  const invalidSpanCount = countInvalidSpans(batch, sourceBinding.byteLength);
  const missingAstFingerprintCount = countMissingAstFingerprints(batch);

  const checks = {
    workspaceRevisionMatches,
    terminalRunOwnerProven,
    sourceBindingMatches,
    sourceRevisionMatches,
    nativeProvenanceProven,
    duplicateSymbolKeyCountZero: duplicateSymbolKeyCount === 0,
    spansValid: invalidSpanCount === 0,
    astFingerprintsPresent: missingAstFingerprintCount === 0,
  };

  const violations = unique([
    workspaceRevisionMatches ? '' : 'WORKSPACE_REVISION_NOT_FULLY_ALIGNED',
    terminalRunOwnerProven ? '' : 'TERMINAL_CANONICAL_GRAPHIFY_RUN_OWNER_NOT_PROVEN',
    sourceBindingMatches ? '' : 'GRAPHIFY_FILE_SOURCE_BINDING_NOT_EXACT',
    sourceRevisionMatches ? '' : 'SOURCE_REVISION_NOT_FULLY_ALIGNED',
    nativeProvenanceProven ? '' : 'STRUCTURAL_PROVENANCE_NOT_NATIVE_PROMOTABLE',
    duplicateSymbolKeyCount === 0 ? '' : `DUPLICATE_SYMBOL_KEYS:${duplicateSymbolKeyCount}`,
    invalidSpanCount === 0 ? '' : `INVALID_PROJECTION_SPANS:${invalidSpanCount}`,
    missingAstFingerprintCount === 0 ? '' : `AST_FINGERPRINT_MISSING:${missingAstFingerprintCount}`,
  ]);

  let status: GraphifySymbolProjectionPreflightStatusV1 = 'READY';
  if (!workspaceRevisionMatches) status = 'BLOCKED_WORKSPACE_REVISION';
  else if (!terminalRunOwnerProven) status = 'BLOCKED_TERMINAL_RUN_OWNER';
  else if (!sourceBindingMatches) status = 'BLOCKED_SOURCE_BINDING';
  else if (!sourceRevisionMatches) status = 'BLOCKED_SOURCE_REVISION';
  else if (!nativeProvenanceProven) status = 'BLOCKED_NON_NATIVE_PROVENANCE';
  else if (duplicateSymbolKeyCount > 0) status = 'BLOCKED_DUPLICATE_SYMBOL_KEY';
  else if (invalidSpanCount > 0) status = 'BLOCKED_INVALID_SPAN';
  else if (missingAstFingerprintCount > 0) status = 'BLOCKED_AST_FINGERPRINT_MISSING';

  const readyForWriter = status === 'READY';
  const inputChecksum = digest({
    admittedWorkspaceRevision,
    batch,
    runOwner,
    sourceBinding,
    structuralReceipt,
  });
  const receiptBody = {
    schema: 'atlas.graphify-symbol-projection-preflight.v1' as const,
    gate: 'SYMBOL-PROJECTION-PREFLIGHT-01' as const,
    status,
    readyForWriter,
    writerMayBeAttempted: readyForWriter,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    admittedWorkspaceRevision,
    workspaceId: batch.workspaceId,
    sourceRef: normalizedBatchSource,
    sourceRevision: batch.sourceRevision,
    runId: runOwner.runId,
    executionId: runOwner.executionId,
    checks,
    counts: {
      symbolCandidateCount: batch.symbols.length,
      edgeCandidateCount: batch.edges.length,
      duplicateSymbolKeyCount,
      invalidSpanCount,
      missingAstFingerprintCount,
    },
    violations,
    inputChecksum,
    producerRevision: GRAPHIFY_SYMBOL_PROJECTION_PREFLIGHT_V1,
  };

  return graphifySymbolProjectionPreflightReceiptV1Schema.parse({
    ...receiptBody,
    receiptChecksum: digest(receiptBody),
  });
}
