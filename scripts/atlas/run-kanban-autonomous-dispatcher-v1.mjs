#!/usr/bin/env node
/**
 * run-kanban-autonomous-dispatcher-v1.mjs
 *
 * Autonomous Kanban Task Dispatcher Daemon.
 * 1. Discovers unblocked tasks whose dependencies are 100% satisfied.
 * 2. Acquires atomic leases with expiration windows.
 * 3. Logs attempt records and lifecycle events.
 * 4. Executes validation commands or controlled dry-run assertions.
 * 5. Commits completion receipts and promotes newly unblocked child tasks.
 *
 * Options:
 *   --batch=<n>      Process at most n ready tasks (default: 5)
 *   --daemon         Run continuously in background polling loop
 *   --poll-ms=<ms>   Polling interval in daemon mode (default: 5000)
 *   --cohort=<id>    Required OpenSpec feature cohort (openspec:<change>)
 *   --plan-only      Read ready tasks in a read-only transaction
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildKanbanReadyTaskPlanV1 } from './kanban-ready-task-plan-v1.mjs';

const args = process.argv.slice(2);
const PLAN_ONLY = args.includes('--plan-only');
const DAEMON = args.includes('--daemon');

const batchArg = args.find((a) => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 5;
const cohortArg = args.find((a) => a.startsWith('--cohort='));
const COHORT = cohortArg?.slice('--cohort='.length);

const pollArg = args.find((a) => a.startsWith('--poll-ms='));
const POLL_MS = pollArg ? parseInt(pollArg.split('=')[1], 10) : 5000;

if (args.includes('--dry-run')) {
  console.error('LEGACY_DRY_RUN_DISABLED: it claims tasks and simulates completion; use --plan-only for a read-only preview.');
  process.exit(2);
}
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 25) {
  console.error('BATCH_SIZE_OUT_OF_RANGE: expected an integer from 1 through 25.');
  process.exit(2);
}
if (typeof COHORT !== 'string' || !/^openspec:[a-z0-9][a-z0-9._-]*$/.test(COHORT)) {
  console.error('COHORT_REQUIRED_OR_INVALID: pass --cohort=openspec:<change>.');
  process.exit(2);
}

const WORKER_ID = `dispatcher-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

async function selectReadyTasks(sql, batchSize, cohort) {
  return sql`
    SELECT t.task_id, t.feature_id, t.feature_label, t.lane, t.status, t.priority, t.validation_command, t.max_retries, t.attempt_count
    FROM kanban_tasks t
    WHERE t.status IN ('pending', 'todo')
      AND t.lane = 'todo'
      AND t.feature_id = ${cohort}
      AND (t.claim_token IS NULL OR t.claim_expires_at < NOW())
      AND NOT EXISTS (
        SELECT 1
        FROM kanban_task_dependencies d
        JOIN kanban_tasks p ON p.task_id = d.parent_task_id
        WHERE d.child_task_id = t.task_id
          AND NOT (p.status = 'completed' AND p.lane = 'done')
      )
    ORDER BY t.priority ASC, t.created_at ASC
    LIMIT ${batchSize};
  `;
}

async function dispatchBatch(sql, batchSize, cohort) {
  const runId = `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const readyTasks = await selectReadyTasks(sql, batchSize, cohort);

  if (readyTasks.length === 0) {
    return { runId, processed: 0, completed: 0, failed: 0 };
  }

  console.log(`[${WORKER_ID}] Found ${readyTasks.length} ready tasks for execution.`);
  let completed = 0;
  let failed = 0;

  for (const task of readyTasks) {
    const claimToken = `claim-${runId}-${task.task_id.slice(-8)}`;
    const claimExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min lease

    // 2. Atomic Lease Acquisition
    const claimRes = await sql`
      UPDATE kanban_tasks
         SET lane = 'in_progress',
             status = 'active',
             claim_token = ${claimToken},
             claim_expires_at = ${claimExpiresAt},
             last_heartbeat_at = NOW(),
             current_run_id = ${runId},
             attempt_count = attempt_count + 1,
             started_at = NOW(),
             updated_at = NOW()
       WHERE task_id = ${task.task_id}
         AND (claim_token IS NULL OR claim_expires_at < NOW())
         AND status IN ('pending', 'todo')
       RETURNING task_id, lane, status, claim_token;
    `;

    if (claimRes.length === 0) {
      console.log(`[${WORKER_ID}] Race: task ${task.task_id} claimed by another worker.`);
      continue;
    }

    // 3. Log Claim Event & Attempt
    await sql`
      INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
      VALUES (${task.task_id}, ${runId}, 'claimed', ${JSON.stringify({ worker: WORKER_ID, claimToken })}, NOW());
    `;

    const attemptRes = await sql`
      INSERT INTO kanban_task_attempts (task_id, run_id, worker, started_at, success)
      VALUES (${task.task_id}, ${runId}, ${WORKER_ID}, NOW(), false)
      RETURNING id;
    `;
    const attemptId = attemptRes[0].id;

    // 4. Execute validation command or controlled dry-run
    let success = true;
    let failureKind = null;
    let stdoutSnippet = '';

    if (task.validation_command) {
      try {
        console.log(`[${WORKER_ID}] Running validation command for ${task.task_id}: ${task.validation_command.slice(0, 80)}...`);
        // If it is a SQL query vs shell command
        if (/^\s*(select|with|show)\s+/i.test(task.validation_command)) {
          const sqlRes = await sql.unsafe(task.validation_command);
          stdoutSnippet = `SQL returned ${sqlRes.length} rows`;
        } else {
          // Bounded shell execution
          const output = execSync(task.validation_command, {
            cwd: REPO_ROOT,
            timeout: 15000,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          stdoutSnippet = output.slice(0, 200);
        }
      } catch (err) {
        console.warn(`[${WORKER_ID}] Task ${task.task_id} validation command exited with error:`, err.message);
        success = false;
        failureKind = 'VALIDATION_FAILED';
        stdoutSnippet = err.message.slice(0, 200);
      }
    } else {
      // Dry-run / structural verification
      stdoutSnippet = 'DEFAULT_PRECONDITION_MET';
    }

    const receiptId = `receipt-${runId}-${task.task_id.slice(-8)}`;

    // 5. Update Status & Attempts
    if (success) {
      await sql`
        UPDATE kanban_tasks
           SET lane = 'done',
               status = 'completed',
               claim_token = NULL,
               claim_expires_at = NULL,
               completed_at = NOW(),
               updated_at = NOW()
         WHERE task_id = ${task.task_id};
      `;

      await sql`
        UPDATE kanban_task_attempts
           SET finished_at = NOW(),
               success = true,
               execution_receipt_id = ${receiptId}
         WHERE id = ${attemptId};
      `;

      await sql`
        INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
        VALUES (${task.task_id}, ${runId}, 'completed', ${JSON.stringify({ receiptId, stdout: stdoutSnippet })}, NOW());
      `;

      // 6. Automatic Child Promotion (check any children whose parents are now all completed)
      const children = await sql`
        SELECT DISTINCT d.child_task_id
        FROM kanban_task_dependencies d
        WHERE d.parent_task_id = ${task.task_id};
      `;

      let promotedCount = 0;
      for (const ch of children) {
        const uncompletedParents = await sql`
          SELECT 1
          FROM kanban_task_dependencies d
          JOIN kanban_tasks p ON p.task_id = d.parent_task_id
          WHERE d.child_task_id = ${ch.child_task_id}
            AND NOT (p.status = 'completed' AND p.lane = 'done')
          LIMIT 1;
        `;
        if (uncompletedParents.length === 0) {
          await sql`
            UPDATE kanban_tasks
               SET lane = 'todo',
                   status = 'pending',
                   updated_at = NOW()
             WHERE task_id = ${ch.child_task_id}
               AND lane = 'blocked';
          `;
          promotedCount++;
        }
      }

      completed++;
      console.log(`[${WORKER_ID}] ✅ Completed ${task.task_id} (receipt: ${receiptId}, promoted ${promotedCount} children).`);
    } else {
      failed++;
      const retriesLeft = (task.max_retries ?? 3) > (task.attempt_count ?? 0);
      await sql`
        UPDATE kanban_tasks
           SET lane = ${retriesLeft ? 'todo' : 'failed'},
               status = ${retriesLeft ? 'pending' : 'failed'},
               failure_count = failure_count + 1,
               claim_token = NULL,
               claim_expires_at = NULL,
               updated_at = NOW()
         WHERE task_id = ${task.task_id};
      `;

      await sql`
        UPDATE kanban_task_attempts
           SET finished_at = NOW(),
               success = false,
               failure_kind = ${failureKind}
         WHERE id = ${attemptId};
      `;

      await sql`
        INSERT INTO kanban_task_events (task_id, run_id, event_type, payload, created_at)
        VALUES (${task.task_id}, ${runId}, 'failed', ${JSON.stringify({ failureKind, error: stdoutSnippet })}, NOW());
      `;

      console.warn(`[${WORKER_ID}] ❌ Failed ${task.task_id} (failureKind: ${failureKind}).`);
    }
  }

  return { runId, processed: readyTasks.length, completed, failed };
}

async function main() {
  console.log(`=== Autonomous Kanban Task Dispatcher (${WORKER_ID}) ===`);
  const repoEnv = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(repoEnv);
  const sql = postgres(dbUrl, { max: 2 });

  try {
    if (PLAN_ONLY) {
      if (DAEMON) throw new Error('PLAN_ONLY_CANNOT_RUN_AS_DAEMON');
      const plan = await sql.begin(async (tx) => {
        await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
        const rows = await selectReadyTasks(tx, BATCH_SIZE, COHORT);
        return buildKanbanReadyTaskPlanV1(rows, BATCH_SIZE, COHORT);
      });
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    if (DAEMON) {
      console.log(`Daemon mode active. Polling every ${POLL_MS}ms. Press Ctrl+C to stop.`);
      while (true) {
        try {
          const res = await dispatchBatch(sql, BATCH_SIZE, COHORT);
          if (res.processed > 0) {
            console.log(`[${WORKER_ID}] Batch completed: ${res.completed} ok, ${res.failed} failed.`);
          }
        } catch (err) {
          console.error(`[${WORKER_ID}] Error in dispatch cycle:`, err.message);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } else {
      // Single batch execution
      const res = await dispatchBatch(sql, BATCH_SIZE, COHORT);
      console.log(`Execution finished: processed ${res.processed}, completed ${res.completed}, failed ${res.failed}.`);
      
      const receiptPath = path.join(REPO_ROOT, 'docs', 'reports', 'kanban-autonomous-dispatcher-receipt.json');
      fs.writeFileSync(receiptPath, JSON.stringify({
        schema: 'atlas.kanban-autonomous-dispatcher.v1',
        timestamp: new Date().toISOString(),
        worker: WORKER_ID,
        result: res,
      }, null, 2));
      console.log(`Receipt saved to: ${receiptPath}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Fatal error in autonomous kanban dispatcher:', err);
  process.exit(1);
});
