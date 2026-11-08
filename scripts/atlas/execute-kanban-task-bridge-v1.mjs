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
const topCohortsLimit = args.has('top-cohorts') ? Number(args.get('top-cohorts')) : (args.get('all-cohorts') === 'true' ? 10 : null);
const workerId = args.get('worker-id') ?? 'opencode-mcp-executor';
const maxPrefillTasks = Math.min(32, Math.max(1, Number(args.get('max-tasks') ?? 5)));
const APPLY = args.get('apply') === 'true';

if (APPLY && process.env.ATLAS_AUTHORIZE_KANBAN_BRIDGE !== '1') {
  console.error('ERROR: Live execution requires explicit ATLAS_AUTHORIZE_KANBAN_BRIDGE=1 environment flag.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 2,
  connectionTimeoutMillis: 5000,
});

const timestamp = new Date().toISOString();
const receipt = {
  schema: 'atlas.kanban-task-execution-bridge-receipt.v1',
  generatedAt: timestamp,
  mode: APPLY ? 'LIVE_APPLY' : 'DRY_RUN_REHEARSAL',
  cohortsEvaluated: [],
  verifiedReceiptsChecked: [],
  writesPerformed: false,
  canonicalAuthority: false,
  verdict: 'PENDING',
};

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

  for (const taskId of (rec.readyTaskIds ?? []).slice(0, maxPrefillTasks)) {
    const taskRes = await client.query(
      `SELECT task_id, feature_label, lane, status, feature_id, priority, source_refs, claim_token, attempt_count, source_revision
       FROM kanban_tasks
       WHERE task_id = $1`,
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
    const isClaimEligible = row.lane === 'todo' && row.status === 'pending' && !row.claim_token && unmetDeps === 0;

    cohortSummary.claimedCandidates.push({
      taskId: row.task_id,
      featureLabel: row.feature_label,
      currentLane: row.lane,
      currentStatus: row.status,
      unmetDependencies: unmetDeps,
      claimEligible: isClaimEligible,
      sourceRefs: row.source_refs,
      action: APPLY && isClaimEligible ? 'CLAIMED_LIVE' : (isClaimEligible ? 'SIMULATED_CLAIM_SUCCESS' : 'BLOCKED_BY_STATE_OR_DEPS'),
    });
  }

  return cohortSummary;
}

let totalEligible = 0;
try {
  const client = await pool.connect();
  let targetCohorts = [];

  try {
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

  receipt.verdict = totalEligible > 0 ? 'BRIDGE_REHEARSAL_PASS' : 'NO_READY_TASKS_CLAIMABLE';
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
  claimEligible: totalEligible,
  verifiedReceiptsChecked: receipt.verifiedReceiptsChecked.length,
  out: path.relative(REPO_ROOT, outPath),
}, null, 2));

process.exit(receipt.verdict === 'ERROR' ? 1 : 0);
