#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyGitSourceRevisionV1,
  classifyGitWorkspaceRevisionV1,
} from '../../src/lib/server/atlas/indexing/git-revision-semantics-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const REPORT_PATH = path.resolve(REPORT_DIR, 'git-revision-semantics-proof.json');
const SOURCE_LIMIT = Math.max(1, Number(process.env.GIT_REVISION_PROOF_SOURCE_LIMIT ?? '50'));

function git(args: string[], allowFailure = false): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

const objectFormatRaw = git(['rev-parse', '--show-object-format']);
const objectFormat = objectFormatRaw === 'sha256' ? 'sha256' : 'sha1';
const commitOid = git(['rev-parse', 'HEAD']);
const treeOid = git(['rev-parse', 'HEAD^{tree}']);
const branchRaw = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
const headDetached = !branchRaw;

const staged = git(['diff', '--cached', '--name-only']);
const unstaged = git(['diff', '--name-only']);
const untracked = git(['ls-files', '--others', '--exclude-standard']);

const workspace = classifyGitWorkspaceRevisionV1({
  objectFormat,
  commitOid,
  treeOid,
  headDetached,
  branchName: branchRaw || null,
  indexClean: staged.length === 0,
  worktreeClean: unstaged.length === 0,
  untrackedClean: untracked.length === 0,
});

const trackedFiles = git(['ls-tree', '-r', '--name-only', 'HEAD'])
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(0, SOURCE_LIMIT);

const sources = trackedFiles.map((relativePath) => {
  const blobOid = git(['rev-parse', `HEAD:${relativePath}`], true) || null;
  const changed = git(['diff', '--quiet', 'HEAD', '--', relativePath], true) === ''
    ? false
    : true;

  // git diff --quiet emits no stdout whether equal or different, so use status porcelain
  // for a stable read-only per-path dirtiness observation instead.
  const status = git(['status', '--porcelain=v1', '--', relativePath], true);
  const workingTreeMatchesCommit = status.length === 0;

  return classifyGitSourceRevisionV1({
    relativePath,
    tracked: blobOid !== null,
    blobOid,
    workingTreeMatchesCommit,
  });
});

const reportCore = {
  schema: 'atlas.git-revision-semantics-proof.v1',
  generatedAt: new Date().toISOString(),
  repositoryRoot: REPO_ROOT,
  workspace,
  sources,
  sampledSourceCount: sources.length,
  sourceLimit: SOURCE_LIMIT,
  semanticDecision: {
    workspaceRevision: 'git:commit:<oid>',
    workspaceTreeRevision: 'git:tree:<oid>',
    sourceRevision: 'git:blob:<oid>',
    sourceRefIdentitySeparate: true,
    dirtyWorktreeBlocksCanonicalAuthority: true,
    contentSha256RemainsObservationAnchorOnly: true,
  },
  existingStoreMapping: {
    atlasSourceRefsCommitSha: 'workspace commit lineage candidate',
    atlasSourceRefsContentHash: 'content digest, not Git blob OID',
    atlasSourceRefsCorpusVersion: 'corpus lifecycle/version namespace, not source blob identity',
    atlasAstNodesSourceRevision: 'candidate sink for accepted source_revision after owner promotion',
  },
  readOnly: true,
  canonicalWriteAttempted: false,
  ownerPromotionAttempted: false,
};

const report = { ...reportCore, outputChecksum: sha256(reportCore) };
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: workspace.canonicalEligible ? 'CLEAN_GIT_REVISION_CANDIDATE_PROVEN' : 'GIT_REVISION_CANDIDATE_BLOCKED_DIRTY_WORKSPACE',
  workspaceRevision: workspace.workspaceRevision,
  workspaceTreeRevision: workspace.workspaceTreeRevision,
  workspaceCanonicalEligible: workspace.canonicalEligible,
  workspaceBlockers: workspace.blockers,
  sampledSources: sources.length,
  sourceCanonicalEligible: sources.filter((source) => source.canonicalEligible).length,
  report: REPORT_PATH,
  readOnly: true,
  canonicalWriteAttempted: false,
}, null, 2));
