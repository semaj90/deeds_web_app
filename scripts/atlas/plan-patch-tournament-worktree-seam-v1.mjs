/**
 * Read-only preflight for the existing three-candidate PatchTournament seam.
 *
 * This produces candidate slots, not candidate patches. It never creates a
 * branch/worktree, applies a patch, runs a test, acquires a lease, or emits a
 * promotion claim. The existing PatchTournament planner remains the owner of
 * the comparison packet once real candidate evidence exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith('--')) args.set(value.slice(2), process.argv[index + 1] ?? '');
}

const objective = args.get('objective') || 'fixture compile-error tournament preflight';
const compileError = args.get('compile-error') || 'fixture compile error';
const workspaceId = args.get('workspace-id') || 'fixture-workspace';
const workspaceRevision = args.get('workspace-revision') || 'fixture-workspace-revision';
const baseBranch = args.get('base-branch') || 'main';
const reportPath = path.join(root, args.get('output') || 'docs/reports/patch-tournament-worktree-seam-v1.json');

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`TOURNAMENT_OWNER_MISSING:${relativePath}`);
  }
}

requireFile('sveltekit-frontend/src/lib/server/agent/patch-tournament.ts');
requireFile('sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts');

const seamIdentity = {
  objective,
  compileError,
  workspaceId,
  workspaceRevision,
  baseBranch,
};
const seamDigest = sha256(JSON.stringify(seamIdentity));
const strategies = [
  ['minimal-scope', 'Smallest change set addressing the exact compile error.'],
  ['owner-reuse', 'Reuse the existing owner/adapter boundary before adding new code.'],
  ['compatibility-preserving', 'Preserve legacy callers while adding the narrowest compatible seam.'],
];

const candidateSlots = strategies.map(([strategy, description], index) => {
  const candidateId = `candidate-${index + 1}`;
  return {
    candidateId,
    strategy,
    description,
    runId: `pending:${seamDigest.slice(7, 23)}:${candidateId}`,
    sourceRevision: workspaceRevision,
    patchDigest: null,
    branchName: `pending/${seamDigest.slice(7, 23)}/${candidateId}`,
    worktreePath: null,
    compileError,
    executionStatus: 'NOT_CREATED',
    staticChecks: [],
    focusedTests: [],
    evidenceRefs: [],
    eligibleForRanking: false,
  };
});

const report = {
  schema: 'atlas.patch-tournament-worktree-seam.v1',
  generatedAt: new Date().toISOString(),
  status: 'THREE_CANDIDATE_SLOTS_PLANNED_EXECUTION_DEFERRED',
  owner: {
    planner: 'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
    schemaRegistry: 'sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts',
    executionWorker: null,
    worktreeLeaseOwner: 'sveltekit-frontend/src/lib/server/workflows/worktree-lease-adapter.ts',
  },
  request: { ...seamIdentity, seamDigest },
  candidateCount: candidateSlots.length,
  candidateSlots,
  requiredBeforePlannerInvocation: [
    'candidate patch content and patchDigest for each slot',
    'immutable source revision readback for each candidate',
    'isolated worktree path and branch readback for each candidate',
    'static checks and focused tests for each surviving candidate',
    'manual approval boundary remains separate from apply',
  ],
  authority: {
    canonicalAuthority: false,
    writesPerformed: false,
    worktreesCreated: false,
    leasesAcquired: false,
    candidatesExecuted: false,
    rankingPerformed: false,
    acePacketEmitted: false,
    autoApply: false,
    training: false,
  },
  nextGate: 'AUTHORIZED_ISOLATED_CANDIDATE_EXECUTION',
  checksum: null,
};
report.checksum = sha256(JSON.stringify({
  schema: report.schema,
  status: report.status,
  owner: report.owner,
  request: report.request,
  candidateCount: report.candidateCount,
  candidateSlots: report.candidateSlots,
  requiredBeforePlannerInvocation: report.requiredBeforePlannerInvocation,
  authority: report.authority,
  nextGate: report.nextGate,
}));

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  candidateCount: report.candidateCount,
  nextGate: report.nextGate,
  writesPerformed: report.authority.writesPerformed,
  reportPath,
}, null, 2));
