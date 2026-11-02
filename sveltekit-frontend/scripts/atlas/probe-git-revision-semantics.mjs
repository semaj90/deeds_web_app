#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const gitFromInvocation = (args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
const repoRoot = gitFromInvocation(['rev-parse', '--show-toplevel']);
const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
const reportPath = path.resolve(
  repoRoot,
  process.env.ATLAS_GIT_REVISION_SEMANTICS_REPORT ?? 'docs/reports/git-revision-semantics-probe.json',
);
const commitSha = git(['rev-parse', 'HEAD']);
const sourcePath = process.env.ATLAS_GIT_REVISION_SAMPLE ?? 'sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts';
const blobOid = git(['rev-parse', `HEAD:${sourcePath}`]);
const worktreeStatus = git(['status', '--porcelain']);
const worktreeDirty = worktreeStatus.length > 0;
const workingTreeBlobOid = git(['hash-object', sourcePath]);
const sourceSnapshotMatches = workingTreeBlobOid === blobOid;
const semanticsStatus = worktreeDirty
  ? 'BLOCKED_DIRTY_WORKTREE'
  : !sourceSnapshotMatches
    ? 'BLOCKED_SOURCE_SNAPSHOT_MISMATCH'
    : 'SEMANTICS_PROVEN_OWNER_UNACCEPTED';

const report = {
  schema: 'atlas.git-revision-semantics-probe.v1',
  status: semanticsStatus,
  readOnly: true,
  canonicalWriteAttempted: false,
  repoRoot,
  workspaceRevisionProposal: {
    value: commitSha,
    semantic: 'GIT_COMMIT_SHA',
    scope: 'repository snapshot',
  },
  sourceRevisionProposal: {
    value: blobOid,
    semantic: 'GIT_BLOB_OID',
    sourcePath,
    scope: 'tracked file content at workspace commit',
  },
  worktree: {
    dirty: worktreeDirty,
    sourceSnapshotMatches,
    workingTreeBlobOid,
    status: worktreeStatus,
  },
  authorityOwner: null,
  disallowedInference: [
    'A readable Git SHA is not canonical authority until a production writer persists it with the structural evidence lifecycle.',
    'A content hash is not source_revision unless the accepted owner contract explicitly maps it to the Git blob OID semantics.',
  ],
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
