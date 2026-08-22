import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CODE_SOURCE_REVISION_SCHEMA } from './code-source-revision-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceRef = z.string().min(1).superRefine((value, ctx) => {
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sourceRef must be repository-relative and traversal-free' });
  }
});
const gitObjectFormatSchema = z.enum(['sha1', 'sha256']);

function gitOidSchema(format: 'sha1' | 'sha256') {
  return format === 'sha1'
    ? z.string().regex(/^[a-f0-9]{40}$/)
    : z.string().regex(/^[a-f0-9]{64}$/);
}

export const workspaceSourceManifestEntryV1Schema = z.object({
  sourceRef,
  sourceRevision,
  contentDigest: sha256,
  byteLength: z.number().int().nonnegative(),
  /** Optional Git blob OID for provenance. It never substitutes for sourceRevision. */
  gitBlobOid: z.string().min(1).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.sourceRevision !== `sha256:${value.contentDigest}`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'sourceRevision must bind the exact contentDigest' });
  }
});
export type WorkspaceSourceManifestEntryV1 = z.infer<typeof workspaceSourceManifestEntryV1Schema>;

export const workspaceRevisionRecordV1Schema = z.object({
  schema: z.literal('atlas.workspace-revision.v1'),
  workspaceRevision: sourceRevision,
  repositoryId: z.string().min(1),
  gitObjectFormat: gitObjectFormatSchema,
  baseCommitOid: z.string().min(1),
  baseTreeOid: z.string().min(1),
  gitHeadRef: z.string().min(1).nullable().default(null),
  dirty: z.boolean(),
  sourceCount: z.number().int().nonnegative(),
  sourceManifestDigest: sha256,
  sourceRevisionAlgorithm: z.literal(CODE_SOURCE_REVISION_SCHEMA),
  generatedAt: z.string().datetime(),
  readOnlyObservation: z.literal(true),
  canonicalAuthority: z.literal(false),
  producerRevision: z.string().min(1),
  checksum: sha256,
}).strict().superRefine((value, ctx) => {
  const oid = gitOidSchema(value.gitObjectFormat);
  if (!oid.safeParse(value.baseCommitOid).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseCommitOid'], message: `baseCommitOid must match ${value.gitObjectFormat}` });
  }
  if (!oid.safeParse(value.baseTreeOid).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseTreeOid'], message: `baseTreeOid must match ${value.gitObjectFormat}` });
  }
  if (value.workspaceRevision !== `sha256:${value.sourceManifestDigest}`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workspaceRevision'], message: 'workspaceRevision must bind the sorted source manifest digest' });
  }
});
export type WorkspaceRevisionRecordV1 = z.infer<typeof workspaceRevisionRecordV1Schema>;

export const workspaceSourceBindingV1Schema = z.object({
  schema: z.literal('atlas.workspace-source-binding.v1'),
  workspaceRevision: sourceRevision,
  sourceRef,
  sourceRevision,
  contentDigest: sha256,
  byteLength: z.number().int().nonnegative(),
  gitObjectFormat: gitObjectFormatSchema,
  baseCommitOid: z.string().min(1),
  gitBlobOid: z.string().min(1).nullable(),
  trackedAtBaseCommit: z.boolean(),
  dirtyRelativeToBaseCommit: z.boolean(),
  sourceManifestOrdinal: z.number().int().nonnegative(),
  readOnlyObservation: z.literal(true),
  canonicalAuthority: z.literal(false),
  producerRevision: z.string().min(1),
  checksum: sha256,
}).strict().superRefine((value, ctx) => {
  if (value.sourceRevision !== `sha256:${value.contentDigest}`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'sourceRevision/contentDigest mismatch' });
  }
  const oid = gitOidSchema(value.gitObjectFormat);
  if (!oid.safeParse(value.baseCommitOid).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseCommitOid'], message: `baseCommitOid must match ${value.gitObjectFormat}` });
  }
  if (value.gitBlobOid !== null && !oid.safeParse(value.gitBlobOid).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gitBlobOid'], message: `gitBlobOid must match ${value.gitObjectFormat}` });
  }
  if (!value.trackedAtBaseCommit && value.gitBlobOid !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gitBlobOid'], message: 'untracked source cannot claim a base-commit blob OID' });
  }
});
export type WorkspaceSourceBindingV1 = z.infer<typeof workspaceSourceBindingV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeManifest(entries: readonly WorkspaceSourceManifestEntryV1[]) {
  const parsed = entries.map((entry) => workspaceSourceManifestEntryV1Schema.parse(entry));
  const ordered = [...parsed].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const refs = new Set<string>();
  for (const entry of ordered) {
    if (refs.has(entry.sourceRef)) throw new Error(`WORKSPACE_REVISION_DUPLICATE_SOURCE_REF:${entry.sourceRef}`);
    refs.add(entry.sourceRef);
  }
  return ordered;
}

/**
 * Canonical workspace revision candidate for the ACTUAL indexed byte set.
 * Git commit/tree IDs are provenance anchors; the manifest digest also changes
 * for dirty and untracked files, which HEAD alone cannot observe.
 */
export function buildWorkspaceRevisionRecordV1(input: {
  repositoryId: string;
  gitObjectFormat: 'sha1' | 'sha256';
  baseCommitOid: string;
  baseTreeOid: string;
  gitHeadRef?: string | null;
  dirty: boolean;
  entries: readonly WorkspaceSourceManifestEntryV1[];
  generatedAt: string;
  producerRevision: string;
}): { record: WorkspaceRevisionRecordV1; entries: WorkspaceSourceManifestEntryV1[] } {
  const entries = normalizeManifest(input.entries);
  const sourceManifestDigest = digest(entries.map(({ sourceRef: ref, sourceRevision: rev, contentDigest, byteLength, gitBlobOid }) => ({
    sourceRef: ref,
    sourceRevision: rev,
    contentDigest,
    byteLength,
    gitBlobOid,
  })));
  const workspaceRevision = `sha256:${sourceManifestDigest}`;
  const payload = {
    schema: 'atlas.workspace-revision.v1' as const,
    workspaceRevision,
    repositoryId: input.repositoryId,
    gitObjectFormat: input.gitObjectFormat,
    baseCommitOid: input.baseCommitOid,
    baseTreeOid: input.baseTreeOid,
    gitHeadRef: input.gitHeadRef ?? null,
    dirty: input.dirty,
    sourceCount: entries.length,
    sourceManifestDigest,
    sourceRevisionAlgorithm: CODE_SOURCE_REVISION_SCHEMA,
    generatedAt: input.generatedAt,
    readOnlyObservation: true as const,
    canonicalAuthority: false as const,
    producerRevision: input.producerRevision,
  };
  return {
    record: workspaceRevisionRecordV1Schema.parse({ ...payload, checksum: digest(payload) }),
    entries,
  };
}

export function buildWorkspaceSourceBindingsV1(input: {
  record: WorkspaceRevisionRecordV1;
  entries: readonly WorkspaceSourceManifestEntryV1[];
  trackedAtBaseCommit: ReadonlyMap<string, boolean>;
  dirtyRelativeToBaseCommit: ReadonlyMap<string, boolean>;
  producerRevision: string;
}): WorkspaceSourceBindingV1[] {
  const record = workspaceRevisionRecordV1Schema.parse(input.record);
  const entries = normalizeManifest(input.entries);
  const manifestDigest = digest(entries.map(({ sourceRef: ref, sourceRevision: rev, contentDigest, byteLength, gitBlobOid }) => ({
    sourceRef: ref,
    sourceRevision: rev,
    contentDigest,
    byteLength,
    gitBlobOid,
  })));
  if (manifestDigest !== record.sourceManifestDigest) throw new Error('WORKSPACE_SOURCE_BINDING_MANIFEST_MISMATCH');

  return entries.map((entry, ordinal) => {
    const trackedAtBaseCommit = input.trackedAtBaseCommit.get(entry.sourceRef) ?? false;
    const dirtyRelativeToBaseCommit = input.dirtyRelativeToBaseCommit.get(entry.sourceRef) ?? !trackedAtBaseCommit;
    const payload = {
      schema: 'atlas.workspace-source-binding.v1' as const,
      workspaceRevision: record.workspaceRevision,
      sourceRef: entry.sourceRef,
      sourceRevision: entry.sourceRevision,
      contentDigest: entry.contentDigest,
      byteLength: entry.byteLength,
      gitObjectFormat: record.gitObjectFormat,
      baseCommitOid: record.baseCommitOid,
      gitBlobOid: trackedAtBaseCommit ? entry.gitBlobOid : null,
      trackedAtBaseCommit,
      dirtyRelativeToBaseCommit,
      sourceManifestOrdinal: ordinal,
      readOnlyObservation: true as const,
      canonicalAuthority: false as const,
      producerRevision: input.producerRevision,
    };
    return workspaceSourceBindingV1Schema.parse({ ...payload, checksum: digest(payload) });
  });
}
