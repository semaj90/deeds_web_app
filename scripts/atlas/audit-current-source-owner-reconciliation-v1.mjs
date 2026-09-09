#!/usr/bin/env node
/**
 * CURRENT-SOURCE-OWNER-RECONCILIATION-01
 *
 * Read-only reconciliation of worktree source truth against current and
 * legacy Graphify ledgers. This script deliberately does not create an
 * execution, refresh sources, or write canonical/projection state.
 */
import crypto from 'node:crypto';
import fs, { statSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-source-owner-reconciliation-v1.json');
const markdownPath = path.join(root, 'docs/reports/current-source-owner-reconciliation-v1.md');
const authorityPath = path.join(root, 'docs/reports/current-graphify-snapshot-authority-v1.json');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim();
const gitMaybe = (args) => { try { return git(args) || null; } catch { return null; } };
const q = async (client, sql, params = []) => (await client.query(sql, params)).rows;

const gitRoot = gitMaybe(['rev-parse', '--show-toplevel']);
const gitCommonDir = gitMaybe(['rev-parse', '--git-common-dir']);
const headCommit = gitMaybe(['rev-parse', 'HEAD']);
const headTree = gitMaybe(['rev-parse', 'HEAD^{tree}']);
const status = gitMaybe(['status', '--porcelain=v1', '--untracked-files=all']) ?? '';
const dirty = status.length > 0;
const sourceExtensions = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp',
  '.sql', '.proto', '.graphql', '.gql',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
]);
const maxSourceBytes = 5 * 1024 * 1024;
const normalizeSourceRef = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');
const isGeneratedSourceArtifact = (value) => normalizeSourceRef(value).toLowerCase().startsWith('docs/reports/');
const isCandidateSource = (value) => {
  const sourceRef = normalizeSourceRef(value);
  return Boolean(sourceRef)
    && !sourceRef.startsWith('.git/')
    && !isGeneratedSourceArtifact(sourceRef)
    && sourceExtensions.has(path.extname(sourceRef).toLowerCase());
};
// Keep this inventory definition aligned with the canonical origin runtime:
// tracked HEAD files plus non-ignored working-tree files, then the same size/UTF-8
// admission checks. The prior audit used tracked-only + a narrower extension set,
// producing a false population mismatch against the workspace revision manifest.
const tracked = gitMaybe(['ls-files', '-z']) ?? '';
const currentInventoryOutput = gitMaybe(['ls-files', '--cached', '--others', '--exclude-standard', '-z']) ?? '';
const trackedRefs = new Set(tracked.split('\0').filter(Boolean).map(normalizeSourceRef));
const candidateRefs = [...new Set(currentInventoryOutput.split('\0').filter(Boolean).map(normalizeSourceRef))].filter(isCandidateSource).sort();
const sourceRefs = [];
const skippedSourceRefs = [];
for (const sourceRef of candidateRefs) {
  try {
    const absolute = path.resolve(root, sourceRef);
    const info = statSync(absolute);
    if (!info.isFile()) {
      skippedSourceRefs.push({ sourceRef, reason: 'NOT_REGULAR_FILE' });
      continue;
    }
    if (info.size > maxSourceBytes) {
      skippedSourceRefs.push({ sourceRef, reason: 'SOURCE_TOO_LARGE' });
      continue;
    }
    const bytes = readFileSync(absolute);
    const sourceText = bytes.toString('utf8');
    if (!Buffer.from(sourceText, 'utf8').equals(bytes)) {
      skippedSourceRefs.push({ sourceRef, reason: 'NOT_VALID_UTF8_SOURCE' });
      continue;
    }
    sourceRefs.push(sourceRef);
  } catch (error) {
    skippedSourceRefs.push({ sourceRef, reason: error instanceof Error ? error.message : String(error) });
  }
}
const sourceRefChecksum = digest([...sourceRefs].sort().join(''));

const report = {
  schema: 'atlas.current-source-owner-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  databaseWrites: 0,
  graphifyMutations: 0,
  packetWrites: 0,
  projectionWrites: 0,
  workspace: {
    root,
    gitRoot,
    gitCommonDir,
    headCommit,
    headTree,
    hostname: os.hostname(),
    dirty,
    sourceCount: sourceRefs.length,
    sourceRefChecksum,
    inventoryPolicy: {
      command: 'git ls-files --cached --others --exclude-standard -z',
      trackedAtHeadCount: trackedRefs.size,
      candidateCount: candidateRefs.length,
      admittedCount: sourceRefs.length,
      skippedCount: skippedSourceRefs.length,
      maxSourceBytes,
      generatedPrefixesExcluded: ['docs/reports/'],
      sourceExtensions: [...sourceExtensions].sort(),
      skippedByReason: skippedSourceRefs.reduce((counts, row) => {
        counts[row.reason] = (counts[row.reason] ?? 0) + 1;
        return counts;
      }, {}),
    },
    status: gitRoot && path.resolve(gitRoot) === path.resolve(root) ? 'PROVEN' : 'WORKTREE_ROOT_MISMATCH',
  },
  currentExecutionCandidates: [],
  legacyGraphifyCandidates: [],
  sourceAuthority: null,
  ownerDecision: null,
  admission: { canonicalAuthority: false, safeToPromote: false, reasons: [] },
};

try {
  report.sourceAuthority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
} catch {
  report.sourceAuthority = null;
}

const client = new pg.Client({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), statement_timeout: 30_000 });
try {
  await client.connect();
  const workspaces = await q(client, `SELECT id::text AS id FROM public.workspaces ORDER BY id LIMIT 20`);
  report.database = { connected: true, workspaceCandidates: workspaces.map((r) => r.id) };
  const currentRevisions = await q(client, `
    SELECT workspace_id::text, workspace_revision, execution_id::text, status,
           canonical_authority, trigger_kind, completed_at
      FROM public.graphify_executions
     WHERE status IN ('COMPLETED', 'COMPLETED_REUSED')
     ORDER BY completed_at DESC NULLS LAST, execution_id
     LIMIT 100
  `);
  for (const execution of currentRevisions) {
    const members = await q(client, `
      SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
        FROM public.graphify_execution_files WHERE execution_id = $1 ORDER BY source_ref
    `, [execution.execution_id]);
    const stage = (await q(client, `
      SELECT status, output_checksum, receipt_ref FROM public.graphify_execution_stages
       WHERE execution_id = $1 AND stage = 'SOURCE_SELECTION'
    `, [execution.execution_id]))[0] ?? null;
    const refs = members.map((m) => String(m.source_ref));
    report.currentExecutionCandidates.push({
      ...execution,
      memberCount: members.length,
      distinctSourceCount: new Set(refs).size,
      workspaceRevisionCount: new Set(members.map((m) => String(m.workspace_revision))).size,
      sourceSelection: stage,
      sourceRefChecksum: digest([...refs].sort().join('')),
      selectionMembershipReadback: members.length > 0,
      canonicalAuthority: false,
    });
  }
  const legacy = await q(client, `
    SELECT gf.last_seen_run_id::text AS run_id, gr.status,
           gr.workspace_revision, MAX(gr.completed_at) AS completed_at, COUNT(*)::int AS file_count
      FROM public.graphify_files gf JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     GROUP BY gf.last_seen_run_id, gr.status, gr.workspace_revision
     ORDER BY MAX(gr.completed_at) DESC NULLS LAST LIMIT 50
  `);
  report.legacyGraphifyCandidates = legacy;
} catch (error) {
  report.database = { connected: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await client.end().catch(() => undefined);
}

const current = report.currentExecutionCandidates.filter((candidate) => candidate.status === 'COMPLETED' && candidate.selectionMembershipReadback);
const authorityExecutionIds = new Set(report.sourceAuthority?.qualifyingExecutionIds ?? []);
const authoritySourceCount = Number(report.sourceAuthority?.sourceSnapshot?.sourceCount ?? 0);
const authorityStatus = report.sourceAuthority?.status;
const exactCurrent = current.filter((candidate) => (
  authorityStatus === 'CURRENT_SNAPSHOT_PROVEN'
  && authorityExecutionIds.has(candidate.execution_id)
  && candidate.memberCount === authoritySourceCount
  && candidate.workspaceRevisionCount === 1
  && candidate.sourceSelection?.status === 'COMPLETED'
));
const legacyCompleted = report.legacyGraphifyCandidates.filter((candidate) => candidate.status === 'COMPLETED');
report.ownerDecision = exactCurrent.length === 1 ? 'CURRENT_EXECUTION_OWNER_CANDIDATE' : exactCurrent.length > 1 ? 'AMBIGUOUS_CURRENT_EXECUTION_OWNERS' : legacyCompleted.length > 0 ? 'LEGACY_ONLY_NO_CURRENT_OWNER' : 'NO_COMPLETED_SOURCE_OWNER';
if (report.workspace.status !== 'PROVEN') report.admission.reasons.push('WORKTREE_ROOT_NOT_PROVEN');
if (report.workspace.sourceCount === 0) report.admission.reasons.push('NO_INDEXABLE_SOURCES');
if (exactCurrent.length !== 1) report.admission.reasons.push('EXACT_CURRENT_COMPLETED_OWNER_COUNT_NOT_ONE');
if (report.workspace.dirty) report.admission.reasons.push('WORKTREE_DIRTY_REQUIRES_SNAPSHOT_POLICY');
if (authoritySourceCount > 0 && report.workspace.sourceCount !== authoritySourceCount) report.admission.reasons.push('STATIC_WORKTREE_INVENTORY_DIFFERS_FROM_WORKSPACE_REVISION_MANIFEST');
report.admission.safeToPromote = report.admission.reasons.length === 0;
report.admission.status = report.admission.safeToPromote ? 'CURRENT_SOURCE_AUTHORITY_PROVEN' : 'CURRENT_SOURCE_AUTHORITY_NOT_PROVEN';
report.checksum = digest(JSON.stringify({ workspace: report.workspace, current: report.currentExecutionCandidates, legacy: report.legacyGraphifyCandidates, ownerDecision: report.ownerDecision }));

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const md = [
  '# Current Source Owner Reconciliation', '',
  `- Status: **${report.admission.status}**`,
  `- Owner decision: **${report.ownerDecision}**`,
  `- Worktree: ${report.workspace.status}; dirty=${report.workspace.dirty}`,
  `- Indexable tracked sources: ${report.workspace.sourceCount}`,
  `- Workspace-revision manifest sources: ${authoritySourceCount || 'unavailable'}`,
  `- Current execution candidates: ${report.currentExecutionCandidates.length}`,
  `- Exact current owners: ${exactCurrent.length}`,
  `- Legacy completed candidates: ${legacyCompleted.length}`,
  `- Writes performed: false`, '',
  '## Admission reasons', '',
  ...(report.admission.reasons.length ? report.admission.reasons.map((reason) => `- ${reason}`) : ['- none']), '',
  `Receipt checksum: \`${report.checksum}\``,
].join('\n');
fs.writeFileSync(markdownPath, `${md}\n`, 'utf8');
console.log(JSON.stringify({ status: report.admission.status, ownerDecision: report.ownerDecision, sourceCount: report.workspace.sourceCount, currentExecutionCandidates: report.currentExecutionCandidates.length, exactCurrentOwners: exactCurrent.length, legacyCompletedCandidates: legacyCompleted.length, writesPerformed: false, reportPath, markdownPath }, null, 2));
