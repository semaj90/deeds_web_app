import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceReceiptV1, buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'docs', 'reports', 'openspec-agentic-completion-agent-09-fixture-receipt-v1.json');
const fixtureReportPath = path.join(root, 'docs', 'reports', 'patch-tournament-worktree-fixture-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const checksumFile = (file) => sha256(fs.readFileSync(file));

if (!fs.existsSync(fixtureReportPath)) throw new Error('PATCH_TOURNAMENT_FIXTURE_REPORT_MISSING');
const census = buildPortfolioCensus(root);
const task = census.tasks.find((candidate) => candidate.changeId === 'parent-atlas-agentic-completion' && candidate.taskId === 'AGENT-09');
if (!task) throw new Error('AGENT_09_TASK_MISSING');
const fixture = JSON.parse(fs.readFileSync(fixtureReportPath, 'utf8'));
const receipt = buildEvidenceReceiptV1({
  schema: 'atlas.evidence-receipt.v1',
  evidenceId: 'receipt:parent-atlas-agentic-completion:AGENT-09:fixture-worktree-v1',
  evidenceType: 'EXECUTION',
  changeId: task.changeId,
  taskId: task.taskId,
  claim: 'The existing PatchTournament planner has a bounded three-candidate isolated-worktree fixture worker with source readback, static checks, focused tests, deterministic ranking, ACE output, and no automatic apply.',
  gitCommit: census.source.gitCommit,
  workspaceRevision: census.source.workspaceRevision,
  sourceRevision: checksumFile(path.join(root, task.tasksPath)),
  taskRevision: task.taskHash,
  sourceRefs: [{
    file: task.tasksPath,
    lineStart: task.sourceLine,
    lineEnd: task.sourceLine + 1,
    sourceRevision: checksumFile(path.join(root, task.tasksPath)),
  }],
  environmentFingerprint: census.source.environmentFingerprint,
  producer: 'scripts/atlas/run-patch-tournament-worktree-fixture-v1.mts',
  command: 'npm run atlas:tournament:worktree:fixture',
  inputs: [{ kind: 'fixture_execution', uri: 'docs/reports/patch-tournament-worktree-fixture-v1.json', checksum: checksumFile(fixtureReportPath) }],
  observedAt: fixture.generatedAt,
  expectedAssertions: [
    { id: 'isolated-worktrees', expected: 'three candidate worktrees execute from one base revision' },
    { id: 'source-readback', expected: 'each candidate reads back the unchanged base revision before and after its uncommitted patch' },
    { id: 'candidate-checks', expected: 'static and focused checks are recorded for all candidates' },
    { id: 'live-admission', expected: 'an admitted live source frame and separately authorized live execution are available' },
  ],
  actualAssertions: [
    { id: 'isolated-worktrees', actual: `${fixture.candidateCount} temporary Git worktrees executed`, passed: fixture.candidateCount === 3 },
    { id: 'source-readback', actual: 'all fixture candidates retained the base revision during patch execution', passed: fixture.candidateExecution.every((candidate) => candidate.readback.baseRevisionMatch) },
    { id: 'candidate-checks', actual: 'two candidates passed static/focused checks and one candidate was blocked', passed: fixture.candidateExecution.filter((candidate) => candidate.staticChecks[0].passed && candidate.focusedTests[0].passed).length === 2 },
    { id: 'live-admission', actual: 'fixture-only execution; live source admission and authorization remain unavailable', passed: false },
  ],
  outputs: [{ kind: 'ace_and_kanban_projection', uri: 'docs/reports/patch-tournament-worktree-fixture-v1.json', checksum: checksumFile(fixtureReportPath) }],
  verifier: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
  readbackRequired: true,
  readbackPerformed: true,
  readbackCommand: 'node -e "const r=require(\'docs/reports/patch-tournament-worktree-fixture-v1.json\'); if(r.candidateCount!==3 || !r.tournament.noAutoApply) process.exit(1)"',
  verdict: 'PARTIAL',
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ evidenceId: receipt.evidenceId, verdict: receipt.verdict, workspaceRevision: receipt.workspaceRevision, outputPath }, null, 2));
