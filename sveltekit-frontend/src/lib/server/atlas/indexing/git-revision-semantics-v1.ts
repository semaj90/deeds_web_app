import { z } from 'zod';

const GitOidSchema = z.string().regex(/^[a-f0-9]{40,64}$/i);

export const GitWorkspaceRevisionV1Schema = z.object({
  schema: z.literal('atlas.git-workspace-revision.v1'),
  objectFormat: z.enum(['sha1', 'sha256']),
  commitOid: GitOidSchema,
  treeOid: GitOidSchema,
  workspaceRevision: z.string().regex(/^git:commit:[a-f0-9]{40,64}$/i),
  workspaceTreeRevision: z.string().regex(/^git:tree:[a-f0-9]{40,64}$/i),
  headDetached: z.boolean(),
  branchName: z.string().min(1).nullable(),
  indexClean: z.boolean(),
  worktreeClean: z.boolean(),
  untrackedClean: z.boolean(),
  canonicalEligible: z.boolean(),
  blockers: z.array(z.string()),
  evidenceAuthority: z.literal(false),
}).strict();

export const GitSourceRevisionV1Schema = z.object({
  schema: z.literal('atlas.git-source-revision.v1'),
  relativePath: z.string().min(1),
  tracked: z.boolean(),
  blobOid: GitOidSchema.nullable(),
  sourceRevision: z.string().regex(/^git:blob:[a-f0-9]{40,64}$/i).nullable(),
  pathAtCommit: z.string().min(1).nullable(),
  workingTreeMatchesCommit: z.boolean(),
  canonicalEligible: z.boolean(),
  blockers: z.array(z.string()),
  evidenceAuthority: z.literal(false),
}).strict();

export type GitWorkspaceRevisionV1 = z.infer<typeof GitWorkspaceRevisionV1Schema>;
export type GitSourceRevisionV1 = z.infer<typeof GitSourceRevisionV1Schema>;

export function classifyGitWorkspaceRevisionV1(input: {
  objectFormat: 'sha1' | 'sha256';
  commitOid: string;
  treeOid: string;
  headDetached: boolean;
  branchName: string | null;
  indexClean: boolean;
  worktreeClean: boolean;
  untrackedClean: boolean;
}): GitWorkspaceRevisionV1 {
  const blockers: string[] = [];
  if (!input.indexClean) blockers.push('INDEX_DIFFERS_FROM_HEAD');
  if (!input.worktreeClean) blockers.push('WORKTREE_DIFFERS_FROM_INDEX');
  if (!input.untrackedClean) blockers.push('UNTRACKED_FILES_PRESENT');

  return GitWorkspaceRevisionV1Schema.parse({
    schema: 'atlas.git-workspace-revision.v1',
    objectFormat: input.objectFormat,
    commitOid: input.commitOid,
    treeOid: input.treeOid,
    workspaceRevision: `git:commit:${input.commitOid}`,
    workspaceTreeRevision: `git:tree:${input.treeOid}`,
    headDetached: input.headDetached,
    branchName: input.branchName,
    indexClean: input.indexClean,
    worktreeClean: input.worktreeClean,
    untrackedClean: input.untrackedClean,
    canonicalEligible: blockers.length === 0,
    blockers,
    evidenceAuthority: false,
  });
}

export function classifyGitSourceRevisionV1(input: {
  relativePath: string;
  tracked: boolean;
  blobOid: string | null;
  workingTreeMatchesCommit: boolean;
}): GitSourceRevisionV1 {
  const blockers: string[] = [];
  if (!input.tracked) blockers.push('SOURCE_NOT_TRACKED_AT_HEAD');
  if (!input.blobOid) blockers.push('BLOB_OID_NOT_AVAILABLE');
  if (!input.workingTreeMatchesCommit) blockers.push('WORKTREE_SOURCE_DIFFERS_FROM_HEAD');

  return GitSourceRevisionV1Schema.parse({
    schema: 'atlas.git-source-revision.v1',
    relativePath: input.relativePath,
    tracked: input.tracked,
    blobOid: input.blobOid,
    sourceRevision: input.blobOid ? `git:blob:${input.blobOid}` : null,
    pathAtCommit: input.tracked ? input.relativePath : null,
    workingTreeMatchesCommit: input.workingTreeMatchesCommit,
    canonicalEligible: blockers.length === 0,
    blockers,
    evidenceAuthority: false,
  });
}

export const GIT_REVISION_SEMANTICS_V1 = Object.freeze({
  workspaceRevision: 'git:commit:<oid>',
  workspaceTreeRevision: 'git:tree:<oid>',
  sourceRevision: 'git:blob:<oid>',
  sourceRefKey: 'path/symbol identity remains separate from revision identity',
  dirtyWorktreePolicy: 'BLOCK_CANONICAL_REVISION_AUTHORITY',
  contentAnchorPolicy: 'content:<sha256> remains observational only when Git revision authority is unavailable',
});
