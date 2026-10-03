#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPatchTournamentPlan } from '../../sveltekit-frontend/src/lib/server/agent/patch-tournament.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(ROOT, process.env.ATLAS_TOURNAMENT_WORKTREE_REPORT ?? 'docs/reports/patch-tournament-worktree-fixture-v1.json');
const keepWorktrees = process.argv.includes('--keep');
const fixtureRoot = mkdtempSync(join(ROOT, '.tmp', 'atlas', 'patch-tournament-worktree-fixture-'));
const repoRoot = join(fixtureRoot, 'repo');
const worktreeRoot = join(fixtureRoot, 'worktrees');
mkdirSync(repoRoot, { recursive: true });
mkdirSync(worktreeRoot, { recursive: true });

const git = (args: string[], cwd = repoRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const run = (command: string, args: string[], cwd: string) => {
  try {
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { passed: true, output: '' };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return { passed: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`.trim().slice(-2000), exitCode: failure.status ?? 1 };
  }
};

const candidates = [
  { candidateId: 'candidate-a', patchSummary: 'minimal syntax repair', touchedFiles: ['fixture.cjs'], riskSignals: [], write: (cwd: string) => writeFileSync(join(cwd, 'fixture.cjs'), 'module.exports = { value: 42 };\n') },
  { candidateId: 'candidate-b', patchSummary: 'broader syntax repair with extra file', touchedFiles: ['fixture.cjs', 'other.cjs'], riskSignals: ['broader-scope'], write: (cwd: string) => { writeFileSync(join(cwd, 'fixture.cjs'), 'module.exports = { value: 42 };\n'); writeFileSync(join(cwd, 'other.cjs'), 'module.exports = { note: \'broader\' };\n'); } },
  { candidateId: 'candidate-c', patchSummary: 'non-repairing candidate', touchedFiles: ['fixture.cjs'], riskSignals: ['syntax-failure'], write: (cwd: string) => writeFileSync(join(cwd, 'fixture.cjs'), 'module.exports = { value: };\n') },
];

const cleanup = () => {
  if (!keepWorktrees) rmSync(fixtureRoot, { recursive: true, force: true });
};

try {
  git(['init', '--initial-branch=main']);
  git(['config', 'user.email', 'atlas-fixture@example.invalid']);
  git(['config', 'user.name', 'Atlas Fixture']);
  writeFileSync(join(repoRoot, 'fixture.cjs'), 'module.exports = { value: };\n');
  writeFileSync(join(repoRoot, 'fixture-test.cjs'), "const { value } = require('./fixture.cjs');\nif (value !== 42) throw new Error('fixture value mismatch');\n");
  git(['add', 'fixture.cjs', 'fixture-test.cjs']);
  git(['commit', '-m', 'fixture: seed compile error']);
  const baseRevision = git(['rev-parse', 'HEAD']);
  const sourceRevision = `git:${baseRevision}`;
  const compileError = 'fixture-syntax-error';
  const executedCandidates = [];

  for (const candidate of candidates) {
    const branchName = `fixture/${candidate.candidateId}`;
    const worktreePath = join(worktreeRoot, candidate.candidateId);
    git(['worktree', 'add', '-b', branchName, worktreePath, baseRevision]);
    const beforeRevision = git(['rev-parse', 'HEAD'], worktreePath);
    const beforeSourceHash = sha256(readFileSync(join(worktreePath, 'fixture.cjs'), 'utf8'));
    candidate.write(worktreePath);
    const afterRevision = git(['rev-parse', 'HEAD'], worktreePath);
    const changedFiles = git(['diff', '--name-only', '--'], worktreePath).split(/\r?\n/).filter(Boolean);
    const staticResult = run('node', ['--check', 'fixture.cjs'], worktreePath);
    const focusedResult = run('node', ['fixture-test.cjs'], worktreePath);
    const patchMaterial = candidate.touchedFiles.map((file) => `${file}\n${readFileSync(join(worktreePath, file), 'utf8')}`).join('\n');
    executedCandidates.push({
      candidateId: candidate.candidateId,
      runId: `fixture-run-${candidate.candidateId}`,
      sourceRevision,
      patchDigest: `sha256:${sha256(patchMaterial)}`,
      branchName,
      worktreePath,
      patchSummary: candidate.patchSummary,
      compileError,
      touchedFiles: candidate.touchedFiles,
      staticChecks: [{ name: 'node --check fixture.cjs', passed: staticResult.passed, command: 'node --check fixture.cjs', evidenceRef: `fixture:${candidate.candidateId}:static` }],
      focusedTests: [{ name: 'fixture-test.cjs', passed: focusedResult.passed, command: 'node fixture-test.cjs', evidenceRef: `fixture:${candidate.candidateId}:focused` }],
      evidenceRefs: [`fixture:${candidate.candidateId}:source-readback`, `fixture:${candidate.candidateId}:static`, `fixture:${candidate.candidateId}:focused`].filter((reference) => candidate.candidateId !== 'candidate-c' || !reference.endsWith(':focused')),
      riskSignals: candidate.riskSignals,
      readback: { beforeRevision, afterRevision, baseRevisionMatch: beforeRevision === baseRevision && afterRevision === baseRevision, beforeSourceHash, changedFiles, changedFilesMatch: JSON.stringify(changedFiles.sort()) === JSON.stringify([...candidate.touchedFiles].sort()) },
      diagnostics: { static: staticResult.output, focused: focusedResult.output },
    });
  }

  const plan = buildPatchTournamentPlan({
    objective: 'bounded fixture compile-error tournament',
    workspaceId: 'fixture-workspace',
    workspaceRevision: 'fixture-unbound-workspace-revision',
    baseBranch: 'main',
    compileError,
    candidates: executedCandidates as any,
  });
  const report = {
    schema: 'atlas.patch-tournament-worktree-fixture.v1',
    generatedAt: new Date().toISOString(),
    mode: 'FIXTURE_ISOLATED_WORKTREE_EXECUTION',
    status: 'FIXTURE_EXECUTION_PROVEN',
    proofLevel: 'FIXTURE_PROVEN',
    authority: false,
    writesPerformed: false,
    canonicalWrites: false,
    autoApply: false,
    training: false,
    baseRevision: git(['rev-parse', 'HEAD']),
    candidateCount: executedCandidates.length,
    candidateExecution: executedCandidates,
    tournament: plan,
    cleanup: { keepWorktrees, fixtureRoot, cleanedUp: !keepWorktrees },
    nextGate: 'ADMITTED_SOURCE_FRAME_AND_AUTHORIZED_LIVE_WORKTREE_EXECUTION',
    likely_cause: 'The existing tournament planner had deterministic fixture replay but no isolated candidate worker seam.',
    evidence: ['temporary Git repository', 'three isolated worktrees', 'source revision readback', 'static checks', 'focused test results', 'existing PatchTournament planner output'],
    patch_targets: ['scripts/atlas/run-patch-tournament-worktree-fixture-v1.mts', 'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts'],
    safe_next_command: 'npx tsx scripts/atlas/run-patch-tournament-worktree-fixture-v1.mts',
    smoke_command: 'npx tsx scripts/atlas/run-patch-tournament-worktree-fixture-v1.mts && node -e "const r=require(\'docs/reports/patch-tournament-worktree-fixture-v1.json\'); if(r.candidateCount!==3 || !r.tournament.noAutoApply) process.exit(1)"',
    report_path: 'docs/reports/patch-tournament-worktree-fixture-v1.json',
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, candidateCount: report.candidateCount, rankedCandidateIds: plan.rankedCandidates.map((candidate) => candidate.candidateId), noAutoApply: plan.noAutoApply, reportPath }, null, 2));
} finally {
  cleanup();
}
