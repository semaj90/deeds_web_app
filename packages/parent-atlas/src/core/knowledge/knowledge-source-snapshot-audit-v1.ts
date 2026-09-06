import { z } from 'zod';
import { knowledgeSourceSnapshotV1Schema, type KnowledgeSourceSnapshotV1 } from './knowledge-source-snapshot-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const rawWorktreeEntryV1Schema = z.object({
  sourceRef: id,
  kind: z.enum(['FILE', 'SYMLINK']),
  executable: z.boolean(),
  contentChecksum: sha256Hex.nullable(),
  symlinkTarget: id.nullable(),
}).strict().superRefine((entry, ctx) => {
  if (entry.kind === 'FILE' && (!entry.contentChecksum || entry.symlinkTarget !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'FILE requires contentChecksum and forbids symlinkTarget' });
  }
  if (entry.kind === 'SYMLINK' && (entry.contentChecksum !== null || !entry.symlinkTarget)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SYMLINK requires symlinkTarget and forbids contentChecksum' });
  }
});
export type RawWorktreeEntryV1 = z.infer<typeof rawWorktreeEntryV1Schema>;

export function buildRawWorktreeFingerprintV1(entriesInput: RawWorktreeEntryV1[]): string {
  const entries = entriesInput.map((entry) => rawWorktreeEntryV1Schema.parse(entry))
    .sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.kind.localeCompare(b.kind));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.sourceRef)) throw new Error(`RAW_WORKTREE_DUPLICATE_SOURCE:${entry.sourceRef}`);
    seen.add(entry.sourceRef);
  }
  return sha256HexV1({ schema: 'atlas.raw-worktree-fingerprint.v1', entries });
}

export const knowledgeSourceRegistryObservationV1Schema = z.object({
  sourceRef: id,
  sourceRevision: revision,
  workspaceRevision: revision,
  sourceInventoryRevision: revision,
  sourceContentChecksum: sha256Hex,
}).strict();
export type KnowledgeSourceRegistryObservationV1 = z.infer<typeof knowledgeSourceRegistryObservationV1Schema>;

export const knowledgeSourceSnapshotIssueKindV1Schema = z.enum([
  'SOURCE_MISSING',
  'WORKSPACE_REVISION_MISMATCH',
  'SOURCE_REVISION_MISMATCH',
  'SOURCE_CONTENT_CHECKSUM_MISMATCH',
  'WORKTREE_FINGERPRINT_UNBOUND',
  'WORKTREE_FINGERPRINT_MISMATCH',
]);

export const knowledgeSourceSnapshotAuditReceiptV1Schema = z.object({
  schema: z.literal('atlas.knowledge-source-snapshot-audit-receipt.v1').default('atlas.knowledge-source-snapshot-audit-receipt.v1'),
  snapshotRevision: revision,
  workspaceRevision: revision,
  sourceSetChecksum: sha256Hex,
  sourceCount: z.number().int().nonnegative(),
  exactRegistryMatches: z.number().int().nonnegative(),
  sourceRegistryParity: z.boolean(),
  worktreeFingerprintParity: z.boolean(),
  observedRawWorktreeFingerprint: sha256Hex.nullable(),
  sourceInventoryRevisions: z.array(revision),
  issues: z.array(z.object({ sourceRef: id.nullable(), kind: knowledgeSourceSnapshotIssueKindV1Schema }).strict()),
  status: z.enum(['PROVEN', 'BLOCKED']),
  writesPerformed: z.literal(false).default(false),
  canonicalAuthority: z.literal(false).default(false),
  receiptChecksum: sha256Hex,
}).strict();
export type KnowledgeSourceSnapshotAuditReceiptV1 = z.infer<typeof knowledgeSourceSnapshotAuditReceiptV1Schema>;

export function auditKnowledgeSourceSnapshotV1(input: {
  snapshot: KnowledgeSourceSnapshotV1;
  observedRegistryRows: KnowledgeSourceRegistryObservationV1[];
  observedRawWorktreeFingerprint: string | null;
}): KnowledgeSourceSnapshotAuditReceiptV1 {
  const snapshot = knowledgeSourceSnapshotV1Schema.parse(input.snapshot);
  const rows = input.observedRegistryRows.map((row) => knowledgeSourceRegistryObservationV1Schema.parse(row));
  const rowBySource = new Map<string, KnowledgeSourceRegistryObservationV1>();
  for (const row of rows) {
    if (rowBySource.has(row.sourceRef)) throw new Error(`SOURCE_REGISTRY_DUPLICATE_SOURCE:${row.sourceRef}`);
    rowBySource.set(row.sourceRef, row);
  }

  const issues: Array<{ sourceRef: string | null; kind: z.infer<typeof knowledgeSourceSnapshotIssueKindV1Schema> }> = [];
  const sourceInventoryRevisions = new Set<string>();
  let exactRegistryMatches = 0;
  for (const source of snapshot.sources) {
    const observed = rowBySource.get(source.sourceRef);
    if (!observed) {
      issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_MISSING' });
      continue;
    }
    sourceInventoryRevisions.add(observed.sourceInventoryRevision);
    let exact = true;
    if (observed.workspaceRevision !== snapshot.workspaceRevision) {
      exact = false;
      issues.push({ sourceRef: source.sourceRef, kind: 'WORKSPACE_REVISION_MISMATCH' });
    }
    if (observed.sourceRevision !== source.sourceRevision) {
      exact = false;
      issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_REVISION_MISMATCH' });
    }
    if (observed.sourceContentChecksum !== source.sourceContentChecksum) {
      exact = false;
      issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_CONTENT_CHECKSUM_MISMATCH' });
    }
    if (exact) exactRegistryMatches += 1;
  }

  let worktreeFingerprintParity = false;
  if (!snapshot.rawWorktreeFingerprint) {
    issues.push({ sourceRef: null, kind: 'WORKTREE_FINGERPRINT_UNBOUND' });
  } else if (!input.observedRawWorktreeFingerprint || snapshot.rawWorktreeFingerprint !== input.observedRawWorktreeFingerprint) {
    issues.push({ sourceRef: null, kind: 'WORKTREE_FINGERPRINT_MISMATCH' });
  } else {
    worktreeFingerprintParity = true;
  }

  issues.sort((a, b) => (a.sourceRef ?? '').localeCompare(b.sourceRef ?? '') || a.kind.localeCompare(b.kind));
  const sourceRegistryParity = exactRegistryMatches === snapshot.sources.length && !issues.some((issue) => issue.sourceRef !== null);
  const body = {
    schema: 'atlas.knowledge-source-snapshot-audit-receipt.v1' as const,
    snapshotRevision: snapshot.snapshotRevision,
    workspaceRevision: snapshot.workspaceRevision,
    sourceSetChecksum: snapshot.sourceSetChecksum,
    sourceCount: snapshot.sources.length,
    exactRegistryMatches,
    sourceRegistryParity,
    worktreeFingerprintParity,
    observedRawWorktreeFingerprint: input.observedRawWorktreeFingerprint,
    sourceInventoryRevisions: [...sourceInventoryRevisions].sort(),
    issues,
    status: sourceRegistryParity && worktreeFingerprintParity ? 'PROVEN' as const : 'BLOCKED' as const,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  };
  return knowledgeSourceSnapshotAuditReceiptV1Schema.parse({ ...body, receiptChecksum: sha256HexV1(body) });
}
