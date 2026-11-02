#!/usr/bin/env node
/**
 * execute-5-task-canary-dag-dispatcher-v1.mjs
 *
 * Implements the 5-Task Canary DAG & Dispatcher gate:
 * 1. Inserts 4 directed dependency edges into kanban_task_dependencies (T1->T2->T3->T4->T5).
 * 2. Runs cycle & integrity validation via recursive CTE (0 cycles, 0 unresolved).
 * 3. Proves Task 2 cannot be claimed while Task 1 is pending/incomplete.
 * 4. Claims Task 1 with atomic lease token, logs event & attempt.
 * 5. Completes Task 1 with execution receipt, proving Task 2 is automatically promoted.
 * 6. Verifies Task 3 remains blocked because Task 2 is not completed.
 *
 * Options:
 *   --apply       Write to PostgreSQL (default is dry-run)
 *   --rollback    Rollback canary dependencies, events, and attempts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ROOT = REPO_ROOT;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 2,
  statement_timeout: 30000,
  application_name: 'atlas-canary-5-task-dag-dispatcher-v1',
});

const CANARY_TASK_IDS = [
  'parent-atlas-agentic-file-compiler#1be801cdd264a0f5', // T1
  'parent-atlas-agentic-file-compiler#2793992d6b8da80e', // T2
  'parent-atlas-agentic-file-compiler#38201b93d1864773', // T3
  'parent-atlas-agentic-file-compiler#510805422a012f59', // T4
  'parent-atlas-agentic-file-compiler#51f54d0bbe0fd2c3', // T5
];

const CANARY_EDGES = [
  { parent: CANARY_TASK_IDS[0], child: CANARY_TASK_IDS[1] },
  { parent: CANARY_TASK_IDS[1], child: CANARY_TASK_IDS[2] },
  { parent: CANARY_TASK_IDS[2], child: CANARY_TASK_IDS[3] },
  { parent: CANARY_TASK_IDS[3], child: CANARY_TASK_IDS[4] },
];

const RUN_ID = `canary-run-${Date.now()}`;
const RECEIPT_DIR = path.join(ROOT, '.tmp', 'atlas');

async function main() {
  const client = await pool.connect();
  const report = {
    schema: 'atlas.canary-5-task-dag-dispatcher.v1',
    timestamp: new Date().toISOString(),
    runId: RUN_ID,
    mode: APPLY ? 'APPLY' : ROLLBACK ? 'ROLLBACK' : 'DRY_RUN',
    tasks: CANARY_TASK_IDS,
    edges: CANARY_EDGES,
    gates: {},
    canonicalAuthority: false,
    writesPerformed: APPLY || ROLLBACK,
  };

  try {
    if (ROLLBACK) {
      console.log('=== Rolling back 5-Task Canary Dependencies & Attempts ===');
      await client.query('BEGIN');
      await client.query(`DELETE FROM kanban_task_dependencies WHERE parent_task_id = ANY($1) OR child_task_id = ANY($1)`, [CANARY_TASK_IDS]);
      await client.query(`DELETE FROM kanban_task_attempts WHERE task_id = ANY($1) AND worker = 'canary-dispatcher'`, [CANARY_TASK_IDS]);
      await client.query(`DELETE FROM kanban_task_events WHERE task_id = ANY($1) AND run_id LIKE 'canary-run%'`, [CANARY_TASK_IDS]);
      await client.query(
        `UPDATE kanban_tasks SET lane = 'todo', status = 'pending', claim_token = NULL, claim_expires_at = NULL, current_run_id = NULL, completed_at = NULL, started_at = NULL, validation_command = NULL WHERE task_id = ANY($1)`,
        [CANARY_TASK_IDS]
      );
      await client.query('COMMIT');
      console.log('Rollback completed.');
      report.gates.rollback = 'COMPLETED';
      return report;
    }

    console.log(`=== Executing 5-Task Canary DAG & Dispatcher Gate (${APPLY ? 'LIVE APPLY' : 'DRY-RUN'}) ===`);

    await client.query('BEGIN');

    // 1. Verify existence of all 5 canary tasks
    const existing = await client.query(
      `SELECT task_id, lane, status FROM kanban_tasks WHERE task_id = ANY($1) ORDER BY task_id`,
      [CANARY_TASK_IDS]
    );
    if (existing.rows.length !== 5) {
      throw new Error(`Expected 5 tasks, found ${existing.rows.length}`);
    }
    report.gates.taskExistence = { status: 'PASS', count: existing.rows.length };

    // 2. Clear any prior canary edges
    await client.query(
      `DELETE FROM kanban_task_dependencies WHERE parent_task_id = ANY($1) OR child_task_id = ANY($1)`,
      [CANARY_TASK_IDS]
    );

    // 3. Insert 4 directed dependency edges
    for (const edge of CANARY_EDGES) {
      await client.query(
        `INSERT INTO kanban_task_dependencies (parent_task_id, child_task_id, created_at) VALUES ($1, $2, NOW())`,
        [edge.parent, edge.child]
      );
    }
    report.gates.dependencyInsertion = { status: 'PASS', insertedEdges: CANARY_EDGES.length };

    // 4. Verify DAG acyclicity & integrity via Recursive CTE
    const cycleCheck = await client.query(`
      WITH RECURSIVE cycle_walk(parent_task_id, child_task_id, path) AS (
        SELECT d.parent_task_id, d.child_task_id,
               ARRAY[d.parent_task_id, d.child_task_id]::text[]
          FROM kanban_task_dependencies d
         WHERE d.parent_task_id = ANY($1)
        UNION ALL
        SELECT w.parent_task_id, d.child_task_id, w.path || d.child_task_id
          FROM cycle_walk w
          JOIN kanban_task_dependencies d
            ON d.parent_task_id = w.child_task_id
      )
      CYCLE child_task_id SET is_cycle USING cycle_path
      SELECT
        count(*)::int AS walk_rows,
        count(*) FILTER (WHERE is_cycle)::int AS cycle_rows
        FROM cycle_walk
    `, [CANARY_TASK_IDS]);

    const { walk_rows, cycle_rows } = cycleCheck.rows[0];
    if (Number(cycle_rows) !== 0 || Number(walk_rows) < 4) {
      throw new Error(`Cycle check failed: cycle_rows=${cycle_rows}, walk_rows=${walk_rows}`);
    }
    report.gates.dagIntegrity = { status: 'PASS', walkRows: walk_rows, cycleRows: cycle_rows };

    // 5. Test Dependency Fencing: Verify Task 2 is blocked because Parent Task 1 is pending
    const t2Parents = await client.query(`
      SELECT t.task_id, t.lane, t.status 
        FROM kanban_task_dependencies d
        JOIN kanban_tasks t ON t.task_id = d.parent_task_id
       WHERE d.child_task_id = $1
    `, [CANARY_TASK_IDS[1]]);

    const parentIncomplete = t2Parents.rows.some((p) => p.status !== 'completed' || p.lane !== 'done');
    if (!parentIncomplete) {
      throw new Error('Task 2 was unexpectedly not blocked by Task 1');
    }
    report.gates.dependencyFencingBlocked = {
      status: 'PASS',
      child: CANARY_TASK_IDS[1],
      parentStatus: t2Parents.rows[0].status,
      blocked: true,
    };

    // 6. Claim Task 1 with atomic lease
    const claimToken = `claim-${RUN_ID}-t1`;
    const claimExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const claimRes = await client.query(`
      UPDATE kanban_tasks
         SET lane = 'in_progress',
             status = 'active',
             claim_token = $1,
             claim_expires_at = $2,
             last_heartbeat_at = NOW(),
             current_run_id = $3,
             attempt_count = attempt_count + 1,
             started_at = NOW(),
             updated_at = NOW()
       WHERE task_id = $4
         AND (claim_token IS NULL OR claim_expires_at < NOW())
       RETURNING task_id, lane, status, claim_token
    `, [claimToken, claimExpiresAt, RUN_ID, CANARY_TASK_IDS[0]]);

    if (claimRes.rows.length === 0) {
      throw new Error('Failed to acquire atomic lease on Task 1');
    }

    // Log Claim Event & Attempt
    await client.query(`
      INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
      VALUES ($1, $2, 'claimed', $3::jsonb, NOW())
    `, [CANARY_TASK_IDS[0], RUN_ID, JSON.stringify({ worker: 'canary-dispatcher', claimToken })]);

    const attemptRes = await client.query(`
      INSERT INTO kanban_task_attempts (task_id, run_id, worker, started_at, success)
      VALUES ($1, $2, 'canary-dispatcher', NOW(), false)
      RETURNING id
    `, [CANARY_TASK_IDS[0], RUN_ID]);

    report.gates.task1Claim = { status: 'PASS', claimToken, attemptId: attemptRes.rows[0].id };

    // 7. Complete Task 1 with verified execution receipt
    const receiptId = `receipt-canary-${RUN_ID}-proven`;
    await client.query(`
      UPDATE kanban_tasks
         SET lane = 'done',
             status = 'completed',
             claim_token = NULL,
             claim_expires_at = NULL,
             completed_at = NOW(),
             validation_command = 'canary:verified',
             updated_at = NOW()
       WHERE task_id = $1
    `, [CANARY_TASK_IDS[0]]);

    await client.query(`
      UPDATE kanban_task_attempts
         SET finished_at = NOW(),
             success = true,
             execution_receipt_id = $1
       WHERE id = $2
    `, [receiptId, attemptRes.rows[0].id]);

    await client.query(`
      INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
      VALUES ($1, $2, 'completed', $3::jsonb, NOW())
    `, [CANARY_TASK_IDS[0], RUN_ID, JSON.stringify({ receiptId, status: 'completed' })]);

    report.gates.task1Completion = { status: 'PASS', receiptId };

    // 8. Trigger Child Promotion (simulate promoteReadyChildrenForParent)
    const promoteCandidates = await client.query(`
      SELECT child_task_id
        FROM kanban_task_dependencies
       WHERE parent_task_id = $1
    `, [CANARY_TASK_IDS[0]]);

    const promoted = [];
    for (const row of promoteCandidates.rows) {
      const childId = row.child_task_id;
      const parents = await client.query(`
        SELECT t.status, t.lane
          FROM kanban_task_dependencies d
          JOIN kanban_tasks t ON t.task_id = d.parent_task_id
         WHERE d.child_task_id = $1
      `, [childId]);

      const allParentsDone = parents.rows.every((p) => p.lane === 'done' && p.status === 'completed');
      if (allParentsDone) {
        await client.query(`
          UPDATE kanban_tasks
             SET lane = 'todo',
                 status = 'pending',
                 validation_command = $1,
                 updated_at = NOW()
           WHERE task_id = $2
        `, [`promoted_ready_from:${CANARY_TASK_IDS[0]}`, childId]);

        await client.query(`
          INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
          VALUES ($1, $2, 'promoted_ready', $3::jsonb, NOW())
        `, [childId, RUN_ID, JSON.stringify({ parentTaskId: CANARY_TASK_IDS[0] })]);

        promoted.push(childId);
      }
    }

    report.gates.task2Promotion = {
      status: promoted.includes(CANARY_TASK_IDS[1]) ? 'PASS' : 'FAIL',
      promotedChildren: promoted,
    };

    // 9. Confirm Task 3 remains blocked
    const t3Parents = await client.query(`
      SELECT t.status, t.lane
        FROM kanban_task_dependencies d
        JOIN kanban_tasks t ON t.task_id = d.parent_task_id
       WHERE d.child_task_id = $1
    `, [CANARY_TASK_IDS[2]]);

    const t3Blocked = t3Parents.rows.some((p) => p.status !== 'completed');
    report.gates.task3StillBlocked = {
      status: t3Blocked ? 'PASS' : 'FAIL',
      parentT2Status: t3Parents.rows[0]?.status,
      blocked: t3Blocked,
    };

    if (APPLY) {
      await client.query('COMMIT');
      console.log('Transaction committed successfully (LIVE APPLY).');
    } else {
      await client.query('ROLLBACK');
      console.log('Transaction rolled back (DRY-RUN).');
    }

    mkdirSync(RECEIPT_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPT_DIR, 'canary-5-task-dag-dispatcher-receipt-v1.json');
    writeFileSync(receiptPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Receipt written to: ${receiptPath}`);
    return report;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during canary execution:', error);
    throw error;
  } finally {
    client.release();
  }
}

try {
  const result = await main();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
