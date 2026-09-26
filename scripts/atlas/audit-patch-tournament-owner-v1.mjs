/**
 * Read-only census of the existing patch-tournament and repair owners.
 *
 * This is deliberately an owner audit, not a tournament runner. It does not
 * create worktrees, acquire leases, execute candidates, persist receipts, or
 * change OpenSpec tasks. Its purpose is to identify the next missing seam
 * without inventing a second tournament implementation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, 'docs/reports/patch-tournament-owner-audit-v1.json');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function textIncludes(relativePath, pattern) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8').includes(pattern);
  } catch {
    return false;
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function owner(id, status, ownerPath, evidence, nextGate) {
  return { id, status, ownerPath, evidence, nextGate };
}

const owners = [
  owner(
    'PATCH_TOURNAMENT_PLANNER',
    exists('sveltekit-frontend/src/lib/server/agent/patch-tournament.ts')
      ? 'PROVEN_FIXTURE_CONTRACT'
      : 'MISSING',
    'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
    'Existing deterministic three-candidate planner with identity guards, ranking, ACE packet, and no-auto-apply flags.',
    'PATCH_TOURNAMENT_CANDIDATE_EXECUTION',
  ),
  owner(
    'PATCH_TOURNAMENT_SCHEMA_REGISTRY',
    textIncludes('sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts', 'PatchTournamentInputSchema')
      ? 'PROVEN_SCHEMA'
      : 'MISSING',
    'sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts',
    'Existing allowlisted tool schema requires exactly three unique candidates and revision-qualified identity.',
    'PATCH_TOURNAMENT_RUNTIME_CALLER',
  ),
  owner(
    'PATCH_TOURNAMENT_FIXTURE_REPLAY',
    exists('docs/reports/patch-tournament-replay-v1.json')
      ? 'PROVEN_FIXTURE_ONLY'
      : 'UNPROVEN',
    'scripts/atlas/run-patch-tournament-replay-v1.mts',
    'Fixture replay proves deterministic ranking and replay equality; it does not create or execute worktrees.',
    'ISOLATED_WORKTREE_EXECUTION',
  ),
  owner(
    'WORKTREE_LEASE_OWNER',
    exists('sveltekit-frontend/src/lib/server/workflows/worktree-lease-adapter.ts')
      ? 'PRESENT_MUTATION_CAPABLE_DEFERRED'
      : 'MISSING',
    'sveltekit-frontend/src/lib/server/workflows/worktree-lease-adapter.ts',
    'Drizzle-backed lease adapter exists, but it is a durable mutation boundary and is not called by this read-only tranche.',
    'AUTHORIZED_WORKTREE_WORKER',
  ),
  owner(
    'CANDIDATE_GENERATION',
    'MISSING_OR_NOT_WIRED',
    'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
    'Planner consumes injected candidates; no current owner was found that generates exactly three isolated repair candidates for one live compile error.',
    'CANDIDATE_GENERATION_OWNER',
  ),
  owner(
    'STATIC_AND_FOCUSED_EXECUTION',
    'MISSING_OR_NOT_WIRED',
    'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
    'Candidate check fields are part of the contract, but no tournament worker path currently populates them from isolated worktree execution.',
    'AUTHORIZED_WORKTREE_WORKER',
  ),
  owner(
    'HUMAN_REVIEW_BOUNDARY',
    exists('sveltekit-frontend/src/lib/server/agent/execution-review.ts')
      ? 'PRESENT_REVIEW_OWNER'
      : 'MISSING',
    'sveltekit-frontend/src/lib/server/agent/execution-review.ts',
    'Existing execution-review boundary can evaluate proposed and actual tool events; it is not automatic approval or merge.',
    'HUMAN_APPROVAL_RECEIPT',
  ),
  owner(
    'ACE_COMPARISON_PACKET',
    textIncludes('sveltekit-frontend/src/lib/server/agent/patch-tournament.ts', 'atlas.ace.patch-tournament.v1')
      ? 'PROVEN_PLANNER_PACKET'
      : 'MISSING',
    'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
    'Planner emits an ACE comparison packet, but a live worker-produced packet is not proven.',
    'ISOLATED_WORKTREE_EXECUTION',
  ),
  owner(
    'DURABLE_TOURNAMENT_RECEIPTS',
    'DEFERRED_NO_NEW_SCHEMA',
    'sveltekit-frontend/src/lib/server/observability/agent-work-receipt-store-v1.ts',
    'Existing agent-work receipt ownership is separate from LangGraph checkpoints; tournament-specific durable history is not introduced here.',
    'OPERATOR_ACCEPTED_RECEIPT_SCHEMA',
  ),
];

const graphProofTasks = (() => {
  const relativePath = 'openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md';
  try {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    return source
      .split(/\r?\n/)
      .filter((line) => /GS1\.41|three candidate tournament|isolated worktrees/i.test(line))
      .slice(0, 12);
  } catch {
    return [];
  }
})();

const unresolved = owners.filter((entry) => !entry.status.startsWith('PROVEN'));
const report = {
  schema: 'atlas.patch-tournament-owner-audit.v1',
  generatedAt: new Date().toISOString(),
  purpose: 'Inventory existing tournament, repair, worktree, review, and receipt owners before implementing the existing seam.',
  authority: {
    canonicalAuthority: false,
    writesPerformed: false,
    taskLedgerMutation: false,
    worktreeCreation: false,
    candidateExecution: false,
    automaticMerge: false,
    training: false,
  },
  owners,
  summary: {
    ownerCount: owners.length,
    provenOwnerCount: owners.filter((entry) => entry.status.startsWith('PROVEN')).length,
    unresolvedOwnerCount: unresolved.length,
    nextGate: 'PATCH_TOURNAMENT_CANDIDATE_EXECUTION',
    status: 'PLANNER_AND_FIXTURE_PROVEN_LIVE_TOURNAMENT_DEFERRED',
  },
  openSpecAlignment: {
    change: 'parent-atlas-agentic-completion',
    task: 'AGENT-09',
    status: 'OPEN',
    ownerChange: 'parent-atlas-graph-retrieval-proof',
    relatedTaskEvidence: graphProofTasks,
    disposition: 'Reuse the existing PatchTournament planner and add only the missing isolated worker seam after authority and approval prerequisites are explicit.',
  },
  retryPolicy: 'Do not retry live tournament execution until candidate generation, isolated worktree execution, and human approval receipts change from their current states.',
  checksum: null,
};
report.checksum = sha256(JSON.stringify({
  schema: report.schema,
  purpose: report.purpose,
  authority: report.authority,
  owners: report.owners,
  summary: report.summary,
  openSpecAlignment: report.openSpecAlignment,
  retryPolicy: report.retryPolicy,
}));

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
try {
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, reportPath);
} finally {
  try { fs.unlinkSync(temporaryPath); } catch { /* already renamed */ }
}
console.log(JSON.stringify({
  schema: report.schema,
  status: report.summary.status,
  ownerCount: report.summary.ownerCount,
  unresolvedOwnerCount: report.summary.unresolvedOwnerCount,
  nextGate: report.summary.nextGate,
  writesPerformed: report.authority.writesPerformed,
  reportPath,
}, null, 2));
