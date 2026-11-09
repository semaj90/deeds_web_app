#!/usr/bin/env node
/**
 * execute-kanban-task-bridge-v1.mjs
 *
 * OpenCode MCP Task Execution Bridge:
 * Connects OpenSpec Workboard -> Kahn DAG Topological Recommendation -> OpenCode Task Claim -> Receipt Verification.
 *
 * REHEARSAL / DRY-RUN BY DEFAULT:
 *   node --env-file=sveltekit-frontend/.env --import tsx/esm scripts/atlas/execute-kanban-task-bridge-v1.mjs --feature-id=openspec:parent-atlas-ace-bitfrost-cache-correctness
 *   node --env-file=sveltekit-frontend/.env --import tsx/esm scripts/atlas/execute-kanban-task-bridge-v1.mjs --feature-id=openspec:parent-atlas-workstation-domain-classifier
 *
 * Live execution requires explicit operator authorization:
 *   ATLAS_AUTHORIZE_KANBAN_BRIDGE=1 node ... --apply
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveDatabaseUrl, loadRepoEnv } from './connection-config.mjs';
import { recommendKanbanDagPrefillV1 } from '../../sveltekit-frontend/src/mcp/kanban-dag-prefill-recommendation.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const args = new Map(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)];
  })
);

const featureIdArg = args.get('feature-id');
const taskIdArg = args.get('task-id');
const topCohortsLimit = args.has('top-cohorts') ? Number(args.get('top-cohorts')) : (args.get('all-cohorts') === 'true' ? 10 : null);
const workerId = args.get('worker-id') ?? 'opencode-mcp-executor';
const APPLY = args.get('apply') === 'true';
const maxPrefillTasks = APPLY ? 1 : Math.min(32, Math.max(1, Number(args.get('max-tasks') ?? 5)));

if (APPLY && process.env.ATLAS_AUTHORIZE_KANBAN_BRIDGE !== '1') {
  console.error('ERROR: Scratch claim rehearsal requires ATLAS_AUTHORIZE_KANBAN_BRIDGE=1.');
  process.exit(1);
}
if (APPLY && (!featureIdArg || !taskIdArg || topCohortsLimit)) {
  console.error('ERROR: --apply requires one exact --feature-id and --task-id; cohort-wide claims are disabled.');
  process.exit(1);
}

const repoEnv = loadRepoEnv(process.env);
const configuredUrl = repoEnv.ATLAS_SCRATCH_PG18_URL || repoEnv.ATLAS_SCRATCH_DB_URL;
const scratchUrl = (() => {
  const url = new URL(configuredUrl || resolveDatabaseUrl(repoEnv));
  if (!configuredUrl) url.pathname = '/legal_ai_live_integration_scratch';
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase()) ||
      Number(url.port || 5432) !== 5434 ||
      url.pathname.replace(/^\/+/, '') !== 'legal_ai_live_integration_scratch') {
    throw new Error('FATAL SAFETY ABORT: Kanban bridge only permits loopback PostgreSQL 18 legal_ai_live_integration_scratch on port 5434.');
  }
  return url.toString();
})();

// The canonical Kanban board uses the SvelteKit DB singleton. Set its target
// before dynamically importing the owner so it resolves to the same scratch DB.
process.env.DATABASE_URL = scratchUrl;

const pool = new pg.Pool({
  connectionString: scratchUrl,
  max: 2,
  connectionTimeoutMillis: 5000,
});

const timestamp = new Date().toISOString();
const receipt = {
  schema: 'atlas.kanban-task-execution-bridge-receipt.v1',
  generatedAt: timestamp,
  mode: APPLY ? 'SCRATCH_CLAIM_REHEARSAL' : 'SCRATCH_DRY_RUN',
  cohortsEvaluated: [],
  verifiedReceiptsChecked: [],
  writesPerformed: false,
  canonicalAuthority: false,
  databaseTarget: 'legal_ai_live_integration_scratch',
  verdict: 'PENDING',
};

let kanbanOwner;

async function getCanonicalKanbanOwner() {
  if (kanbanOwner) return kanbanOwner;
  const [owner, database] = await Promise.all([
    import('../../sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts'),
    import('../../sveltekit-frontend/src/lib/server/db/client.ts'),
  ]);
  const ownerUrl = new URL(database.pool.options.connectionString);
  if (ownerUrl.hostname !== '127.0.0.1' || Number(ownerUrl.port) !== 5434 ||
      ownerUrl.pathname.replace(/^\/+/, '') !== 'legal_ai_live_integration_scratch') {
    throw new Error('FATAL SAFETY ABORT: canonical Kanban owner did not resolve to the authorized scratch database.');
  }
  kanbanOwner = owner;
  return owner;
}

async function evaluateCohort(client, targetFeatureId) {
  console.log(`[Bridge] Evaluating DAG recommendation for feature cohort: ${targetFeatureId}`);
  const rec = await recommendKanbanDagPrefillV1(pool, {
    featureId: targetFeatureId,
    cohortLimit: 64,
    maxPrefillTasks,
  });

  const cohortSummary = {
    featureId: targetFeatureId,
    status: rec.status,
    algorithm: rec.algorithm ?? null,
    taskCount: rec.graphProfile?.taskCount ?? 0,
    dependencyCount: rec.graphProfile?.dependencyCount ?? 0,
    readyCount: rec.readyTaskIds?.length ?? 0,
    claimedCandidates: [],
  };

  const readyTaskIds = rec.readyTaskIds ?? [];
  if (APPLY && !readyTaskIds.includes(taskIdArg)) {
    cohortSummary.claimedCandidates.push({ taskId: taskIdArg, action: 'CLAIM_REFUSED_NOT_IN_DAG_READY_SET' });
  }
  const candidateTaskIds = APPLY
    ? (readyTaskIds.includes(taskIdArg) ? [taskIdArg] : [])
    : readyTaskIds.slice(0, maxPrefillTasks);
  for (const taskId of candidateTaskIds) {
    const taskRes = await client.query(
      `SELECT t.task_id, t.feature_label, t.lane, t.status, t.feature_id, t.priority,
              t.source_refs, t.claim_token, t.attempt_count, t.source_revision,
              t.validation_command, p.cohort_revision, p.source_revision AS prefill_source_revision
       FROM public.kanban_tasks t
       LEFT JOIN public.atlas_kanban_dag_prefill_v1 p
         ON p.task_id = t.task_id AND p.canonical_task_key = t.task_id
       WHERE t.task_id = $1`,
      [taskId]
    );

    if (taskRes.rows.length === 0) {
      cohortSummary.claimedCandidates.push({ taskId, status: 'TASK_NOT_FOUND' });
      continue;
    }

    const row = taskRes.rows[0];

    const depRes = await client.query(
      `SELECT d.parent_task_id, p.lane, p.status
       FROM kanban_task_dependencies d
       LEFT JOIN kanban_tasks p ON p.task_id = d.parent_task_id
       WHERE d.child_task_id = $1
         AND (p.task_id IS NULL OR p.lane != 'done' OR p.status != 'completed')`,
      [taskId]
    );

    const unmetDeps = depRes.rows.length;
    const sourceRevision = String(row.source_revision ?? '');
    const hasRevisionBoundPrefill = Boolean(
      /^sha256:[0-9a-f]{64}$/.test(sourceRevision) &&
      row.prefill_source_revision === sourceRevision &&
      /^sha256:[0-9a-f]{64}$/.test(String(row.cohort_revision ?? ''))
    );
    const validationCommand = String(row.validation_command ?? '').trim();
    const hasRunnableValidation = Boolean(validationCommand) &&
      !/^(claimed_by:|completed_by:|verified_receipt:|retry:|blocked:)/i.test(validationCommand);
    const isClaimEligible = row.lane === 'todo' && row.status === 'pending' && !row.claim_token &&
      unmetDeps === 0 && hasRevisionBoundPrefill && hasRunnableValidation;
    const candidate = {
      taskId: row.task_id,
      featureLabel: row.feature_label,
      currentLane: row.lane,
      currentStatus: row.status,
      unmetDependencies: unmetDeps,
      claimEligible: isClaimEligible,
      sourceRefs: row.source_refs,
      sourceRevision: sourceRevision || null,
      cohortRevision: row.cohort_revision ?? null,
      hasRevisionBoundPrefill,
      hasRunnableValidation,
      action: isClaimEligible ? 'ELIGIBLE_UNCLAIMED' : 'BLOCKED_BY_STATE_OR_PROVENANCE',
    };

    if (APPLY && taskId === taskIdArg && isClaimEligible) {
      const owner = await getCanonicalKanbanOwner();
      try {
        const claim = await owner.claimKanbanTask({
          taskId,
          workerId,
          expectedSourceRevision: sourceRevision,
          validationCommand,
        });
        const readback = await owner.showKanbanTask({ taskId });
        const validClaim = readback?.lane === 'in_progress' && readback.status === 'active' &&
          readback.claimToken === claim.claimToken && readback.currentRunId === claim.runId &&
          readback.sourceRevision === sourceRevision &&
          Date.parse(readback.claimExpiresAt ?? '') > Date.now();
        if (!validClaim) throw new Error('CANONICAL_CLAIM_READBACK_MISMATCH');
        candidate.action = 'CLAIMED_LIVE';
        candidate.claimToken = claim.claimToken;
        candidate.runId = claim.runId;
        candidate.claimExpiresAt = claim.claimExpiresAt;
        candidate.claimReadbackVerified = true;
        receipt.writesPerformed = true;
      } catch (error) {
        candidate.action = 'CLAIM_FAILED';
        candidate.claimError = error instanceof Error ? error.message : String(error);
      }
    } else if (APPLY && taskId === taskIdArg) {
      candidate.action = 'CLAIM_REFUSED_NOT_ELIGIBLE';
    }
    cohortSummary.claimedCandidates.push(candidate);
  }

  return cohortSummary;
}

let totalEligible = 0;
try {
  const client = await pool.connect();
  let targetCohorts = [];

  try {
    const databaseIdentity = (await client.query(
      `SELECT current_database() AS database_name, current_setting('server_version_num')::int AS server_version_num`
    )).rows[0];
    if (databaseIdentity?.database_name !== 'legal_ai_live_integration_scratch' ||
        Number(databaseIdentity.server_version_num) < 180000) {
      throw new Error('FATAL SAFETY ABORT: connected database must be PostgreSQL 18 legal_ai_live_integration_scratch.');
    }
    receipt.databaseVersion = Number(databaseIdentity.server_version_num);

    if (topCohortsLimit) {
      const cohortQuery = await client.query(
        `SELECT feature_id, count(*)::int as count
         FROM kanban_tasks
         GROUP BY feature_id
         HAVING count(*) <= 64 AND count(*) >= 5
         ORDER BY count DESC
         LIMIT $1`,
        [topCohortsLimit]
      );
      targetCohorts = cohortQuery.rows.map((r) => r.feature_id);
    } else {
      targetCohorts = [featureIdArg ?? 'openspec:parent-atlas-ace-bitfrost-cache-correctness'];
    }

    for (const cid of targetCohorts) {
      const summary = await evaluateCohort(client, cid);
      receipt.cohortsEvaluated.push(summary);
    }
  } finally {
    client.release();
  }

  // Check known verified receipts in .tmp/atlas
  const receiptDir = path.join(REPO_ROOT, '.tmp', 'atlas');
  let knownReceipts = [];
  try {
    const files = await fs.readdir(receiptDir);
    for (const f of files.filter((x) => x.endsWith('-execution-receipt.json'))) {
      const data = JSON.parse(await fs.readFile(path.join(receiptDir, f), 'utf8'));
      knownReceipts.push({ file: f, taskCode: data.taskCode, verdict: data.verdict, passedTests: data.summary?.passed ?? null });
    }
  } catch {
    // optional directory
  }
  receipt.verifiedReceiptsChecked = knownReceipts;

  totalEligible = receipt.cohortsEvaluated.reduce(
    (acc, c) => acc + c.claimedCandidates.filter((cand) => cand.claimEligible).length,
    0
  );

  const totalClaimed = receipt.cohortsEvaluated.reduce(
    (acc, c) => acc + c.claimedCandidates.filter((cand) => cand.action === 'CLAIMED_LIVE' && cand.claimReadbackVerified).length,
    0
  );
  receipt.verdict = APPLY
    ? (totalClaimed === 1 ? 'CLAIMED_LIVE_READBACK_VERIFIED' : 'SCRATCH_CLAIM_NOT_PROVEN')
    : (totalEligible > 0 ? 'ELIGIBLE_UNCLAIMED_CANDIDATES' : 'NO_READY_TASKS_CLAIMABLE');
} catch (err) {
  receipt.verdict = 'ERROR';
  receipt.error = err.message;
  console.error(`[Bridge Error]`, err);
} finally {
  await pool.end();
}

const outDir = path.join(REPO_ROOT, '.tmp', 'atlas');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `kanban-task-bridge-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
await fs.writeFile(outPath, JSON.stringify(receipt, null, 2) + '\n');

console.log(JSON.stringify({
  status: receipt.verdict,
  mode: receipt.mode,
  cohortsCount: receipt.cohortsEvaluated.length,
  totalReadyCandidates: receipt.cohortsEvaluated.reduce((acc, c) => acc + c.claimedCandidates.length, 0),
  eligibleUnclaimed: totalEligible,
  claimedLiveReadbackVerified: receipt.cohortsEvaluated.reduce((acc, c) => acc + c.claimedCandidates.filter((x) => x.action === 'CLAIMED_LIVE' && x.claimReadbackVerified).length, 0),
  verifiedReceiptsChecked: receipt.verifiedReceiptsChecked.length,
  out: path.relative(REPO_ROOT, outPath),
}, null, 2));

process.exit(['ERROR', 'SCRATCH_CLAIM_NOT_PROVEN'].includes(receipt.verdict) ? 1 : 0);
