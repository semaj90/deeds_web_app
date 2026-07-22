#!/usr/bin/env node
/**
 * graphify-trigger-downstream-pipeline.mjs
 *
 * Master orchestrator: chains graphify readiness → pagerank → recommendations → kanban → turbovec
 *
 * Flow:
 *   1. Poll /api/graphify/status until coreStructural === 'PASS'
 *   2. Trigger npm run atlas:code-features:pagerank --apply
 *   3. Wait for pagerank completion (Postgres updated_at)
 *   4. Trigger npm run atlas:pipeline:kanban --stage kanban_task
 *   5. Trigger npm run atlas:recommendations:kanban
 *   6. Parse kanban output → write kanban_tasks table
 *   7. Emit final report to docs/reports/
 *
 * Usage:
 *   node scripts/atlas/graphify-trigger-downstream-pipeline.mjs [--wait-ready] [--apply] [--verbose] [--skip-pagerank] [--skip-kanban] [--skip-turbovec]
 *   npm run graphify:downstream:chain
 *   npm run graphify:downstream:chain:apply
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.resolve(REPO_ROOT, 'sveltekit-frontend');

// CLI flags
const args = process.argv.slice(2);
const WAIT_READY = args.includes('--wait-ready');
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const SKIP_PAGERANK = args.includes('--skip-pagerank');
const SKIP_KANBAN = args.includes('--skip-kanban');
const SKIP_TURBOVEC = args.includes('--skip-turbovec');
const DRY_RUN = !APPLY;

// Lock file to prevent concurrent execution
const LOCK_FILE = path.join(REPO_ROOT, '.graphify-pipeline-lock');
const LOCK_TIMEOUT_MS = 1200000; // 20 minutes max execution time

// Service URLs
const SVELTEKIT_URL = process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

// Logging
const log = (msg) => console.log(`[graphify-chain] ${msg}`);
const err = (msg) => console.error(`[graphify-chain] ERROR: ${msg}`);

// Report output
const REPORT_DIR = path.join(REPO_ROOT, 'docs/reports');
const REPORT_FILE = path.join(REPORT_DIR, `graphify-downstream-chain-${new Date().toISOString().split('T')[0]}.json`);

const report = {
  timestamp: new Date().toISOString(),
  mode: DRY_RUN ? 'dry-run' : 'apply',
  dryRun: DRY_RUN,
  stages: {},
  errors: [],
  summary: { success: false, message: '', elapsed_ms: 0 }
};

const startTime = Date.now();

function resolveSpawnCommand(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'npm') return 'npm.cmd';
  if (command === 'npx') return 'npx.cmd';
  return command;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Poll /api/graphify/status until ready
// ─────────────────────────────────────────────────────────────────────────────

async function waitGraphifyReady(timeoutMs = 120000) {
  const stage = 'graphify_readiness_check';
  report.stages[stage] = { status: 'running', polls: 0, elapsed_ms: 0 };

  const startCheck = Date.now();
  const pollInterval = 2000;
  const maxPolls = Math.floor(timeoutMs / pollInterval);

  for (let i = 0; i < maxPolls; i++) {
    try {
      const res = await fetch(`${SVELTEKIT_URL}/api/graphify/status`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        if (i < 3) log(`Poll ${i + 1}/${maxPolls}: HTTP ${res.status} (SvelteKit warming up...)`);
        await new Promise(r => setTimeout(r, pollInterval));
        report.stages[stage].polls = i + 1;
        continue;
      }

      const data = await res.json();
      const coreStatus = data.status?.coreStructural ?? 'unknown';

      report.stages[stage].polls = i + 1;
      report.stages[stage].coreStatus = coreStatus;

      if (coreStatus === 'PASS') {
        report.stages[stage].status = 'pass';
        report.stages[stage].elapsed_ms = Date.now() - startCheck;
        log(`✅ Graphify core ready (${i + 1} polls, ${data.blockingLanes?.length ?? 0} blocking lanes)`);
        return true;
      }

      if (VERBOSE) log(`Poll ${i + 1}/${maxPolls}: coreStructural=${coreStatus}`);

      await new Promise(r => setTimeout(r, pollInterval));
    } catch (e) {
      if (i < 3) log(`Poll ${i + 1}/${maxPolls}: ${e.message}`);
      report.stages[stage].polls = i + 1;
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  report.stages[stage].status = 'timeout';
  report.stages[stage].elapsed_ms = Date.now() - startCheck;
  log(`⚠️  Graphify readiness timeout after ${maxPolls} polls. Proceeding with caution.`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: PageRank authority scoring
// ─────────────────────────────────────────────────────────────────────────────

async function runPageRank() {
  if (SKIP_PAGERANK) {
    report.stages.pagerank = { status: 'skipped', reason: '--skip-pagerank' };
    log('⏭️  Skipping PageRank (--skip-pagerank)');
    return true;
  }

  const stage = 'pagerank';
  report.stages[stage] = { status: 'running' };

  return new Promise((resolve) => {
    const cmd = resolveSpawnCommand('npm');
    const cmdArgs = ['run', 'atlas:code-features:pagerank', ...(APPLY ? ['--apply'] : ['--dry-run'])];

    if (VERBOSE) log(`Running: ${cmd} ${cmdArgs.join(' ')}`);

    const child = spawn(cmd, cmdArgs, {
      cwd: FRONTEND_ROOT,
      stdio: APPLY ? 'pipe' : 'inherit',
      shell: false,
      windowsHide: true,
    });

    let output = '';
    if (child.stdout) child.stdout.on('data', (data) => { output += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      report.stages[stage].status = 'timeout';
      report.stages[stage].error = 'PageRank timeout (60s)';
      err('PageRank timeout');
      resolve(false);
    }, 60000);

    child.on('exit', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        report.stages[stage].status = 'pass';
        log(`✅ PageRank complete (exit code ${code})`);
        resolve(true);
      } else {
        report.stages[stage].status = 'fail';
        report.stages[stage].error = `Exit code ${code}`;
        err(`PageRank failed with exit code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      report.stages[stage].status = 'error';
      report.stages[stage].error = e.message;
      err(`PageRank error: ${e.message}`);
      resolve(false);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: LangGraph kanban task emission
// ─────────────────────────────────────────────────────────────────────────────

async function runKanbanEmit() {
  if (SKIP_KANBAN) {
    report.stages.kanban_emit = { status: 'skipped', reason: '--skip-kanban' };
    log('⏭️  Skipping kanban emit (--skip-kanban)');
    return true;
  }

  const stage = 'kanban_emit';
  report.stages[stage] = { status: 'running' };

  return new Promise((resolve) => {
    const cmd = 'node';
    const script = path.join(REPO_ROOT, 'scripts/atlas/graphify-langgraph-pipeline.mjs');
    const cmdArgs = [script, '--stage', 'kanban_task', ...(APPLY ? ['--apply'] : [])];

    if (VERBOSE) log(`Running: ${cmd} ${cmdArgs.join(' ')}`);

    const child = spawn(cmd, cmdArgs, {
      cwd: REPO_ROOT,
      stdio: APPLY ? 'pipe' : 'inherit',
      shell: false,
    });

    let output = '';
    if (child.stdout) child.stdout.on('data', (data) => { output += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      report.stages[stage].status = 'timeout';
      report.stages[stage].error = 'Kanban emit timeout (120s)';
      err('Kanban emit timeout');
      resolve(false);
    }, 120000);

    child.on('exit', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        report.stages[stage].status = 'pass';
        log(`✅ Kanban tasks emitted (exit code ${code})`);
        resolve(true);
      } else {
        report.stages[stage].status = 'fail';
        report.stages[stage].error = `Exit code ${code}`;
        err(`Kanban emit failed with exit code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      report.stages[stage].status = 'error';
      report.stages[stage].error = e.message;
      err(`Kanban emit error: ${e.message}`);
      resolve(false);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: TurboVec ANN consolidation
// ─────────────────────────────────────────────────────────────────────────────

async function runTurboVecConsolidation() {
  if (SKIP_TURBOVEC) {
    report.stages.turbovec = { status: 'skipped', reason: '--skip-turbovec' };
    log('⏭️  Skipping TurboVec consolidation (--skip-turbovec)');
    return true;
  }

  const stage = 'turbovec';
  report.stages[stage] = { status: 'running' };

  return new Promise((resolve) => {
    const cmd = resolveSpawnCommand('npx');
    const script = path.join(FRONTEND_ROOT, 'scripts/atlas/kanban-turbovec-consolidation.mts');
    const cmdArgs = ['tsx', script, ...(APPLY ? ['--apply'] : [])];

    if (VERBOSE) log(`Running: ${cmd} ${cmdArgs.join(' ')}`);

    const child = spawn(cmd, cmdArgs, {
      cwd: FRONTEND_ROOT,
      stdio: APPLY ? 'pipe' : 'inherit',
      shell: false,
      windowsHide: true,
    });

    let output = '';
    if (child.stdout) child.stdout.on('data', (data) => { output += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      report.stages[stage].status = 'timeout';
      report.stages[stage].error = 'TurboVec timeout (180s)';
      err('TurboVec timeout');
      resolve(false);
    }, 180000);

    child.on('exit', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        report.stages[stage].status = 'pass';
        log(`✅ TurboVec consolidation complete (exit code ${code})`);
        resolve(true);
      } else {
        report.stages[stage].status = 'fail';
        report.stages[stage].error = `Exit code ${code}`;
        err(`TurboVec consolidation failed with exit code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      report.stages[stage].status = 'error';
      report.stages[stage].error = e.message;
      err(`TurboVec error: ${e.message}`);
      resolve(false);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5: Write kanban tasks to DB
// ─────────────────────────────────────────────────────────────────────────────

async function writeKanbanTasksToDB() {
  const stage = 'kanban_db_write';
  report.stages[stage] = { status: 'running' };

  try {
    // Read .tmp/kanban_tasks.jsonl if it exists
    const kanbanPath = path.join(FRONTEND_ROOT, '.tmp/kanban_tasks.jsonl');
    let taskCount = 0;

    try {
      const content = await fs.readFile(kanbanPath, 'utf8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      taskCount = lines.length;

      if (APPLY && taskCount > 0) {
        // Insert into kanban_tasks table (upsert pattern) with TRANSACTION
        const client = await pool.connect();
        try {
          // BEGIN TRANSACTION — all-or-nothing guarantee
          await client.query('BEGIN');

          for (const line of lines) {
            const task = JSON.parse(line);
            await client.query(
              `INSERT INTO kanban_tasks (task_id, feature_id, feature_label, source_refs, lane, status)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (task_id) DO UPDATE SET
                 lane = EXCLUDED.lane,
                 status = EXCLUDED.status,
                 updated_at = NOW()`,
              [
                task.taskId || `task:${Date.now()}:${Math.random()}`,
                task.featureId || 'unknown',
                task.featureLabel || 'Unnamed task',
                JSON.stringify(task.sourceRefs || []),
                task.lane || 'todo',
                task.status || 'pending'
              ]
            );
          }

          // COMMIT TRANSACTION — either all rows written or none (rollback on any error)
          await client.query('COMMIT');
          report.stages[stage].status = 'pass';
          report.stages[stage].tasks_written = taskCount;
          log(`✅ Wrote ${taskCount} kanban tasks to DB (atomic transaction)`);
        } catch (e) {
          // ROLLBACK on any error — ensures no partial writes
          try {
            await client.query('ROLLBACK');
          } catch {}
          throw e;
        } finally {
          client.release();
        }
      } else if (!APPLY) {
        report.stages[stage].status = 'pass';
        report.stages[stage].tasks_found = taskCount;
        report.stages[stage].note = 'dry-run mode, no writes';
        log(`ℹ️  Found ${taskCount} kanban tasks (dry-run, not writing)`);
      }

      return true;
    } catch (e) {
      if (e.code === 'ENOENT') {
        report.stages[stage].status = 'warn';
        report.stages[stage].warning = 'kanban_tasks.jsonl not found';
        log(`⚠️  No kanban tasks file found (expected if kanban_emit skipped or failed)`);
        return true;
      }
      throw e;
    }
  } catch (e) {
    report.stages[stage].status = 'error';
    report.stages[stage].error = e.message;
    err(`Failed to write kanban tasks: ${e.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock file management (prevent concurrent execution)
// ─────────────────────────────────────────────────────────────────────────────

async function acquireLock() {
  try {
    // Check if lock file exists and is recent
    const stat = await fs.stat(LOCK_FILE).catch(() => null);
    if (stat) {
      const age = Date.now() - stat.mtime.getTime();
      if (age < LOCK_TIMEOUT_MS) {
        throw new Error(`Another orchestrator is running (lock age: ${Math.floor(age / 1000)}s). Wait for completion or delete ${LOCK_FILE}.`);
      }
      // Lock is stale, remove and proceed
      await fs.unlink(LOCK_FILE).catch(() => {});
    }

    // Create new lock file with timestamp
    await fs.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }), 'utf8');
    log(`✅ Lock acquired (${LOCK_FILE})`);
  } catch (e) {
    err(`Failed to acquire lock: ${e.message}`);
    throw e;
  }
}

async function releaseLock() {
  try {
    await fs.unlink(LOCK_FILE).catch(() => {});
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const overallTimeout = setTimeout(() => {
    err(`HARD TIMEOUT: Orchestrator exceeded ${LOCK_TIMEOUT_MS / 60000} minutes. Terminating.`);
    process.exit(1);
  }, LOCK_TIMEOUT_MS);

  try {
    // Acquire lock to prevent concurrent execution
    await acquireLock();

    log(`Starting downstream pipeline orchestrator (${APPLY ? 'APPLY' : 'DRY-RUN'} mode)`);
    log(`Services: SvelteKit=${SVELTEKIT_URL}, DB=${DATABASE_URL.split('@')[1] ?? '?'}`);

    // Stage 1: Wait for graphify readiness (REQUIRED in APPLY mode)
    if (WAIT_READY || APPLY) {
      log(`Waiting for graphify readiness${APPLY ? ' (REQUIRED for apply mode)' : ''}...`);
      const ready = await waitGraphifyReady();
      if (!ready && APPLY) {
        // HARD FAIL in APPLY mode — readiness gate must pass before writing to DB
        report.summary.message = 'Pipeline blocked: Graphify services not ready';
        report.summary.success = false;
        throw new Error('Readiness check failed. Use --wait-ready to retry, or check service health.');
      }
      if (!ready && !APPLY) {
        log('Graphify not ready, but proceeding in dry-run mode (advisory only)');
      }
    } else {
      log('Skipping readiness check (use --wait-ready to enable or run in --apply mode)');
      report.stages.graphify_readiness_check = { status: 'skipped', reason: 'not requested' };
    }

    // Stage 2: PageRank
    if (!SKIP_PAGERANK) {
      const success = await runPageRank();
      if (!success && APPLY) {
        report.summary.message = 'Pipeline stopped: PageRank failed';
        report.summary.success = false;
        throw new Error('PageRank stage failed');
      }
    }

    // Stage 3: Kanban emit
    if (!SKIP_KANBAN) {
      const success = await runKanbanEmit();
      if (!success && APPLY) {
        report.summary.message = 'Pipeline stopped: Kanban emit failed';
        report.summary.success = false;
        throw new Error('Kanban emit stage failed');
      }
    }

    // Stage 4: TurboVec
    if (!SKIP_TURBOVEC) {
      const success = await runTurboVecConsolidation();
      if (!success && APPLY) {
        report.summary.message = 'Pipeline stopped: TurboVec consolidation failed';
        report.summary.success = false;
        throw new Error('TurboVec stage failed');
      }
    }

    // Stage 5: Write kanban tasks to DB
    if (!SKIP_KANBAN) {
      const success = await writeKanbanTasksToDB();
      if (!success && APPLY) {
        report.summary.message = 'Pipeline stopped: Kanban DB write failed';
        report.summary.success = false;
        throw new Error('Kanban DB write stage failed');
      }
    }

    // Success
    report.summary.success = true;
    report.summary.message = 'Pipeline complete';
    report.summary.elapsed_ms = Date.now() - startTime;

    log(`✅ Pipeline complete (${report.summary.elapsed_ms}ms)`);

  } catch (e) {
    report.errors.push(e.message);
    report.summary.elapsed_ms = Date.now() - startTime;
    report.summary.success = false;
    err(e.message);
  } finally {
    clearTimeout(overallTimeout);

    // Write report
    try {
      await fs.mkdir(REPORT_DIR, { recursive: true });
      await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
      log(`Report written to ${path.relative(REPO_ROOT, REPORT_FILE)}`);
    } catch (e) {
      err(`Failed to write report: ${e.message}`);
    }

    // Release lock
    await releaseLock();

    await pool.end();
    process.exit(report.summary.success ? 0 : 1);
  }
}

main();
