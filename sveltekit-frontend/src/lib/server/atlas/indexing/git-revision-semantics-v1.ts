import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GitObjectFormatV1Schema = z.enum(['sha1', 'sha256']);
export type GitObjectFormatV1 = z.infer<typeof GitObjectFormatV1Schema>;

export const GitWorktreeStateV1Schema = z.enum(['CLEAN', 'DIRTY', 'UNAVAILABLE']);
export type GitWorktreeStateV1 = z.infer<typeof GitWorktreeStateV1Schema>;

const gitOidSchema = z.string().regex(/^[a-f0-9]{40}$|^[a-f0-9]{64}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const GitWorkspaceSnapshotV1Schema = z.object({
  repoId: z.string().min(1),
  objectFormat: GitObjectFormatV1Schema,
  commitOid: gitOidSchema,
  treeOid: gitOidSchema,
  headRef: z.string().min(1).nullable(),
  detachedHead: z.boolean(),
  worktreeState: GitWorktreeStateV1Schema,
  worktreeStatusSha256: sha256Schema.nullable(),
  originKind: z.literal('GIT_COMMIT_OBJECT'),
  currentWorkspaceRevisionColumnKind: z.literal('INTEGER_LEDGER_KEY'),
  rawCommitOidIsWorkspaceRevisionColumnValue: z.literal(false),
}).strict();
export type GitWorkspaceSnapshotV1 = z.infer<typeof GitWorkspaceSnapshotV1Schema>;

export const GitSourceTreeEntryV1Schema = z.object({
  sourceRef: z.string().min(1),
  objectMode: z.string().regex(/^[0-7]{6}$/),
  objectType: z.enum(['blob', 'commit', 'tree', 'unknown']),
  objectOid: gitOidSchema,
  workingTreeObjectOid: gitOidSchema.nullable(),
  workingTreeMatchesSnapshot: z.boolean(),
  sourceRevisionId: z.string().regex(/^gitsrc:v1:[a-f0-9]{64}$/).nullable(),
  sourceRevisionSemantics: z.literal('PATH_SCOPED_GIT_OBJECT_VERSION'),
  sourceRevisionInputs: z.tuple([
    z.literal('repoId'),
    z.literal('sourceRef'),
    z.literal('objectMode'),
    z.literal('blobOid'),
  ]),
  workspaceBindingSeparate: z.literal(true),
  authorityEligible: z.boolean(),
  blockers: z.array(z.string().min(1)),
}).strict();
export type GitSourceTreeEntryV1 = z.infer<typeof GitSourceTreeEntryV1Schema>;

export const GitRevisionSemanticsProofV1Schema = z.object({
  schema: z.literal('atlas.git-revision-semantics-proof.v1'),
  status: z.enum([
    'SEMANTICS_PROVEN_OWNER_UNACCEPTED',
    'BLOCKED_DIRTY_WORKTREE',
    'BLOCKED_GIT_OBJECT_RESOLUTION',
    'BLOCKED_SOURCE_SNAPSHOT_MISMATCH',
  ]),
  workspace: GitWorkspaceSnapshotV1Schema,
  sources: z.array(GitSourceTreeEntryV1Schema),
  semanticDecision: z.object({
    workspaceOrigin: z.literal('GIT_COMMIT_OBJECT'),
    workspaceStoredValue: z.literal('INTERNAL_LEDGER_KEY_REQUIRED'),
    workspaceExternalIdentity: z.literal('GIT_COMMIT_OID'),
    sourceOrigin: z.literal('GIT_TREE_ENTRY'),
    sourceStoredValue: z.literal('REVISIONED_SOURCE_REF_ID'),
    rawBlobOidAloneIsSourceRevision: z.literal(false),
    sourceRevisionStableAcrossUnchangedWorkspaceCommits: z.literal(true),
    sourceRevisionChangesOnPathModeOrBlobChange: z.literal(true),
    workspaceSourceBindingRequired: z.literal(true),
    dirtyWorktreeMayClaimHeadSnapshot: z.literal(false),
    atlasSourceRefsCurrentSchemaOwnsRevisionHistory: z.literal(false),
  }).strict(),
  storageGap: z.object({
    workspaceRevisionLedgerPresent: z.literal(false),
    codeSourceRevisionLedgerPresent: z.literal(false),
    workspaceSourceBindingPresent: z.literal(false),
    atlasSourceRefsPrimaryKeyIsRevisionQualified: z.literal(false),
  }).strict(),
  workspaceRevisionOwnerAccepted: z.literal(false),
  sourceRevisionOwnerAccepted: z.literal(false),
  canonicalPromotionAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  readOnly: z.literal(true),
  blockers: z.array(z.string().min(1)),
  producerRevision: z.string().min(1),
  outputChecksum: sha256Schema,
}).strict();
export type GitRevisionSemanticsProofV1 = z.infer<typeof GitRevisionSemanticsProofV1Schema>;

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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeGitSourceRefV1(value: string): string {
  let normalized = value.trim().replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalized) throw new Error('GIT_SOURCE_REF_REQUIRED');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`GIT_SOURCE_REF_MUST_BE_REPOSITORY_RELATIVE:${value}`);
  }
  const parts = normalized.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error(`GIT_SOURCE_REF_PARENT_TRAVERSAL:${value}`);
  normalized = parts.join('/');
  if (!normalized) throw new Error('GIT_SOURCE_REF_REQUIRED');
  return normalized;
}

/**
 * A code source revision is path-scoped content identity, not a workspace commit.
 * Keeping commit/workspace binding separate means an unchanged file retains its
 * source revision across multiple commits while each workspace snapshot remains
 * independently addressable.
 */
export function deriveGitSourceRevisionIdV1(input: {
  repoId: string;
  sourceRef: string;
  objectMode: string;
  blobOid: string;
}): string {
  const repoId = input.repoId.trim();
  if (!repoId) throw new Error('GIT_REPO_ID_REQUIRED');
  const sourceRef = normalizeGitSourceRefV1(input.sourceRef);
  if (!/^[0-7]{6}$/.test(input.objectMode)) throw new Error(`GIT_OBJECT_MODE_INVALID:${input.objectMode}`);
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(input.blobOid)) throw new Error(`GIT_BLOB_OID_INVALID:${input.blobOid}`);
  return `gitsrc:v1:${sha256([repoId, sourceRef, input.objectMode, input.blobOid].join('\0'))}`;
}

export function buildGitSourceTreeEntryV1(input: {
  repoId: string;
  sourceRef: string;
  objectMode: string;
  objectType: 'blob' | 'commit' | 'tree' | 'unknown';
  objectOid: string;
  workingTreeObjectOid: string | null;
}): GitSourceTreeEntryV1 {
  const sourceRef = normalizeGitSourceRefV1(input.sourceRef);
  const blockers: string[] = [];
  if (input.objectType !== 'blob') blockers.push(`SOURCE_OBJECT_NOT_BLOB:${input.objectType}`);
  const workingTreeMatchesSnapshot = input.workingTreeObjectOid === input.objectOid;
  if (!input.workingTreeObjectOid) blockers.push('WORKING_TREE_OBJECT_OID_UNAVAILABLE');
  else if (!workingTreeMatchesSnapshot) blockers.push('WORKING_TREE_BYTES_DIFFER_FROM_COMMIT_BLOB');

  const sourceRevisionId = input.objectType === 'blob'
    ? deriveGitSourceRevisionIdV1({
        repoId: input.repoId,
        sourceRef,
        objectMode: input.objectMode,
        blobOid: input.objectOid,
      })
    : null;

  return GitSourceTreeEntryV1Schema.parse({
    sourceRef,
    objectMode: input.objectMode,
    objectType: input.objectType,
    objectOid: input.objectOid,
    workingTreeObjectOid: input.workingTreeObjectOid,
    workingTreeMatchesSnapshot,
    sourceRevisionId,
    sourceRevisionSemantics: 'PATH_SCOPED_GIT_OBJECT_VERSION',
    sourceRevisionInputs: ['repoId', 'sourceRef', 'objectMode', 'blobOid'],
    workspaceBindingSeparate: true,
    authorityEligible: blockers.length === 0,
    blockers,
  });
}

export function buildGitRevisionSemanticsProofV1(input: {
  workspace: GitWorkspaceSnapshotV1;
  sources: GitSourceTreeEntryV1[];
  gitObjectsResolved: boolean;
  producerRevision: string;
}): GitRevisionSemanticsProofV1 {
  const workspace = GitWorkspaceSnapshotV1Schema.parse(input.workspace);
  const sources = input.sources.map((source) => GitSourceTreeEntryV1Schema.parse(source));
  const blockers: string[] = [
    'WORKSPACE_REVISION_LEDGER_NOT_IMPLEMENTED',
    'CODE_SOURCE_REVISION_LEDGER_NOT_IMPLEMENTED',
    'WORKSPACE_SOURCE_BINDING_NOT_IMPLEMENTED',
    'REVISION_OWNER_ACCEPTANCE_NOT_GRANTED',
  ];

  let status: GitRevisionSemanticsProofV1['status'] = 'SEMANTICS_PROVEN_OWNER_UNACCEPTED';
  if (!input.gitObjectsResolved || workspace.worktreeState === 'UNAVAILABLE') {
    status = 'BLOCKED_GIT_OBJECT_RESOLUTION';
    blockers.push('GIT_OBJECT_RESOLUTION_INCOMPLETE');
  } else if (workspace.worktreeState === 'DIRTY') {
    status = 'BLOCKED_DIRTY_WORKTREE';
    blockers.push('WORKTREE_DOES_NOT_EQUAL_HEAD_SNAPSHOT');
  } else if (sources.some((source) => !source.authorityEligible)) {
    status = 'BLOCKED_SOURCE_SNAPSHOT_MISMATCH';
    blockers.push('ONE_OR_MORE_SOURCE_TREE_ENTRIES_NOT_AUTHORITY_ELIGIBLE');
  }

  const payload = {
    schema: 'atlas.git-revision-semantics-proof.v1' as const,
    status,
    workspace,
    sources,
    semanticDecision: {
      workspaceOrigin: 'GIT_COMMIT_OBJECT' as const,
      workspaceStoredValue: 'INTERNAL_LEDGER_KEY_REQUIRED' as const,
      workspaceExternalIdentity: 'GIT_COMMIT_OID' as const,
      sourceOrigin: 'GIT_TREE_ENTRY' as const,
      sourceStoredValue: 'REVISIONED_SOURCE_REF_ID' as const,
      rawBlobOidAloneIsSourceRevision: false as const,
      sourceRevisionStableAcrossUnchangedWorkspaceCommits: true as const,
      sourceRevisionChangesOnPathModeOrBlobChange: true as const,
      workspaceSourceBindingRequired: true as const,
      dirtyWorktreeMayClaimHeadSnapshot: false as const,
      atlasSourceRefsCurrentSchemaOwnsRevisionHistory: false as const,
    },
    storageGap: {
      workspaceRevisionLedgerPresent: false as const,
      codeSourceRevisionLedgerPresent: false as const,
      workspaceSourceBindingPresent: false as const,
      atlasSourceRefsPrimaryKeyIsRevisionQualified: false as const,
    },
    workspaceRevisionOwnerAccepted: false as const,
    sourceRevisionOwnerAccepted: false as const,
    canonicalPromotionAllowed: false as const,
    canonicalWritesAllowed: false as const,
    readOnly: true as const,
    blockers,
    producerRevision: input.producerRevision,
  };

  return GitRevisionSemanticsProofV1Schema.parse({
    ...payload,
    outputChecksum: sha256(stable(payload)),
  });
}
