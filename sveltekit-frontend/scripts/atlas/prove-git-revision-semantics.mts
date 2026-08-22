#!/usr/bin/env tsx

/**
 * Read-only Git revision semantics proof for Parent Atlas code ingestion.
 *
 * Reads Git object identities and working-tree bytes only. It does not update
 * Postgres, Qdrant, Valkey, Git refs, the Git index, or the object database.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildGitRevisionSemanticsProofV1,
  buildGitSourceTreeEntryV1,
  type GitObjectFormatV1,
  type GitWorkspaceSnapshotV1,
} from '../../src/lib/server/atlas/indexing/git-revision-semantics-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);

function value(name: string, fallback: string | null = null): string | null {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function git(commandArgs: string[], allowFailure = false): string {
  try {
    return execFileSync('git', commandArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`GIT_COMMAND_FAILED:${commandArgs.join(' ')}:${detail}`);
  }
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sourceArgs(): string[] {
  const direct = args.filter((arg) => arg.startsWith('--source=')).map((arg) => arg.slice('--source='.length));
  const one = value('source');
  const values = direct.length > 0 ? direct : one ? [one] : [];
  if (values.length > 0) return [...new Set(values)];
  return [
    'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-materializer.ts',
    'sveltekit-frontend/scripts/atlas/native-structural-materializer.mts',
    'sveltekit-frontend/src/lib/server/db/schema/atlas-acquisition.ts',
  ];
}

function parseObjectFormat(): GitObjectFormatV1 {
  const reported = git(['rev-parse', '--show-object-format'], true).split(/\s+/)[0]?.trim();
  if (reported === 'sha1' || reported === 'sha256') return reported;
  const oid = git(['rev-parse', 'HEAD']);
  return oid.length === 64 ? 'sha256' : 'sha1';
}

function parseTreeEntry(sourceRef: string): {
  objectMode: string;
  objectType: 'blob' | 'commit' | 'tree' | 'unknown';
  objectOid: string;
} | null {
  const raw = git(['ls-tree', 'HEAD', '--', sourceRef], true);
  if (!raw) return null;
  const tab = raw.indexOf('\t');
  const metadata = (tab >= 0 ? raw.slice(0, tab) : raw).trim().split(/\s+/);
  const mode = metadata[0] ?? '';
  const type = metadata[1] ?? 'unknown';
  const oid = metadata[2] ?? '';
  return {
    objectMode: mode,
    objectType: type === 'blob' || type === 'tree' || type === 'commit' ? type : 'unknown',
    objectOid: oid,
  };
}

async function workingTreeOid(sourceRef: string): Promise<string | null> {
  const absolute = path.join(REPO_ROOT, sourceRef);
  try { await access(absolute); } catch { return null; }
  const oid = git(['hash-object', `--path=${sourceRef}`, '--', sourceRef], true);
  return oid || null;
}

const repoId = value('repo-id', process.env.ATLAS_REPO_ID ?? 'deeds-web-app')!;
const reportPath = path.resolve(value('report', 'docs/reports/git-revision-semantics-proof.json')!);
const markdownPath = reportPath.replace(/\.json$/i, '.md');
const requestedSources = sourceArgs().map((item) => item.trim().replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean);

const rawStatus = git(['status', '--porcelain=v1', '--untracked-files=all'], true);
const worktreeState = rawStatus.length === 0 ? 'CLEAN' as const : 'DIRTY' as const;
const headRef = git(['symbolic-ref', '-q', 'HEAD'], true) || null;
const commitOid = git(['rev-parse', 'HEAD']);
const treeOid = git(['rev-parse', 'HEAD^{tree}']);
const objectFormat = parseObjectFormat();

const workspace: GitWorkspaceSnapshotV1 = {
  repoId,
  objectFormat,
  commitOid,
  treeOid,
  headRef,
  detachedHead: headRef === null,
  worktreeState,
  worktreeStatusSha256: sha256Text(rawStatus),
  originKind: 'GIT_COMMIT_OBJECT',
  currentWorkspaceRevisionColumnKind: 'INTEGER_LEDGER_KEY',
  rawCommitOidIsWorkspaceRevisionColumnValue: false,
};

let gitObjectsResolved = true;
const sources = [];
const missing: string[] = [];
for (const sourceRef of requestedSources) {
  const entry = parseTreeEntry(sourceRef);
  if (!entry) {
    gitObjectsResolved = false;
    missing.push(sourceRef);
    continue;
  }
  sources.push(buildGitSourceTreeEntryV1({
    repoId,
    sourceRef,
    objectMode: entry.objectMode,
    objectType: entry.objectType,
    objectOid: entry.objectOid,
    workingTreeObjectOid: await workingTreeOid(sourceRef),
  }));
}

const proof = buildGitRevisionSemanticsProofV1({
  workspace,
  sources,
  gitObjectsResolved,
  producerRevision: 'prove-git-revision-semantics.v1',
});

const report = {
  ...proof,
  requestedSources,
  missingSources: missing,
  commandsAreReadOnly: true,
  gitCommandsUsed: [
    'git status --porcelain=v1 --untracked-files=all',
    'git symbolic-ref -q HEAD',
    'git rev-parse HEAD',
    'git rev-parse HEAD^{tree}',
    'git rev-parse --show-object-format',
    'git ls-tree HEAD -- <sourceRef>',
    'git hash-object --path=<sourceRef> -- <sourceRef>',
  ],
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

const lines = [
  '# Parent Atlas Git revision semantics proof',
  '',
  `- status: **${report.status}**`,
  `- repo: \`${repoId}\``,
  `- HEAD commit: \`${commitOid}\``,
  `- HEAD tree: \`${treeOid}\``,
  `- object format: \`${objectFormat}\``,
  `- worktree: **${worktreeState}**`,
  `- workspace owner accepted: **${report.workspaceRevisionOwnerAccepted}**`,
  `- source owner accepted: **${report.sourceRevisionOwnerAccepted}**`,
  `- canonical writes allowed: **${report.canonicalWritesAllowed}**`,
  '',
  '## Decision',
  '',
  '- Workspace external identity: Git commit OID.',
  '- Existing integer workspace_revision requires a separate internal ledger key; a commit SHA must not be coerced into it.',
  '- Code source revision identity: repository + source path + Git object mode + committed blob OID.',
  '- Workspace-to-source binding remains separate so unchanged sources can retain one source revision across multiple commits.',
  '- Dirty working-tree bytes cannot claim the HEAD snapshot.',
  '- Current atlas_source_refs storage is not accepted as historical revision authority because its key is not revision-qualified.',
  '',
  '## Sources',
  '',
  ...report.sources.map((source) => `- \`${source.sourceRef}\`: ${source.authorityEligible ? 'ELIGIBLE' : 'BLOCKED'}; blob=\`${source.objectOid}\`; sourceRevision=\`${source.sourceRevisionId}\``),
  ...(missing.length ? ['', 'Missing from HEAD:', ...missing.map((source) => `- \`${source}\``)] : []),
  '',
  '## Blockers',
  '',
  ...report.blockers.map((blocker) => `- ${blocker}`),
];
await writeFile(markdownPath, lines.join('\n') + '\n', 'utf8');

console.log(JSON.stringify({
  status: report.status,
  worktreeState,
  sourceCount: report.sources.length,
  missingSources: missing,
  workspaceRevisionOwnerAccepted: false,
  sourceRevisionOwnerAccepted: false,
  canonicalWritesAllowed: false,
  reportPath,
  markdownPath,
}, null, 2));

// A blocked dirty/missing proof is a healthy fail-closed result, but return 2 so
// automation cannot accidentally mistake it for an accepted owner proof.
if (report.status !== 'SEMANTICS_PROVEN_OWNER_UNACCEPTED') process.exitCode = 2;
