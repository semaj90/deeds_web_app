#!/usr/bin/env node
/**
 * Proof of Truth Orchestrator
 *
 * Modular verification system for Parent Atlas features.
 * Runs 4-lane proof system: replay → cache → live app → cubic adversarial.
 *
 * story_id flows through:
 *   ACP → TRACE MCP (Graphify) → Adaptive Router (Karpathy) → HyperRAG → Packets → Gemma4
 *
 * Usage:
 *   npm run startup:proof-of-truth [--story-id=...] [--tasks=replay,cache,live,cubic] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Configuration ──────────────────────────────────────────────────────────

const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1] ||
                  `ATLAS-PROOF-${Date.now()}`;
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const TASKS = process.argv.find(a => a.startsWith('--tasks='))?.split('=')[1]?.split(',') ||
              ['replay', 'cache', 'live', 'cubic'];

const REPORT_DIR = path.join(ROOT, 'docs/reports/proof-of-truth');

// ── Utilities ──────────────────────────────────────────────────────────────

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '✓',
    warn: '⚠',
    error: '✗',
    debug: '◆'
  }[level] || '•';

  console.log(`[${timestamp}] ${prefix} ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function runSkillTest(skillName, args) {
  return new Promise((resolve, reject) => {
    log(`Running skill test: ${skillName}`);

    if (DRY_RUN) {
      log(`  [DRY-RUN] Would execute: npm run skill:${skillName} ${args.join(' ')}`, 'debug');
      resolve({ success: true, skill: skillName, dry_run: true });
      return;
    }

    const cmd = `npm`;
    const cmdArgs = ['run', `skill:${skillName}`, '--', ...args];

    if (VERBOSE) {
      log(`  Command: ${cmd} ${cmdArgs.join(' ')}`, 'debug');
    }

    const proc = spawn(cmd, cmdArgs, {
      cwd: path.join(ROOT, 'sveltekit-frontend'),
      stdio: 'pipe',
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (VERBOSE) process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (VERBOSE) process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, skill: skillName, stdout, stderr });
      } else {
        reject(new Error(`${skillName} failed with code ${code}: ${stderr}`));
      }
    });
  });
}

// ── Lane Executors ─────────────────────────────────────────────────────────

async function runLane1_ReplayProof() {
  log('\n🔄 LANE 1: Replay Proof (50 golden queries)');

  try {
    const result = await runSkillTest('replay-proof', [
      `--story-id=${STORY_ID}-REPLAY`,
      '--queries=golden_50',
      '--expected-coverage=0.95'
    ]);

    return {
      lane: 'replay',
      status: 'PASS',
      story_id: `${STORY_ID}-REPLAY`,
      timestamp: new Date().toISOString(),
      dry_run: DRY_RUN,
      verdict: DRY_RUN ? 'PENDING' : 'PASS'
    };
  } catch (error) {
    log(`Lane 1 failed: ${error.message}`, 'error');
    return {
      lane: 'replay',
      status: 'FAIL',
      error: error.message,
      verdict: 'FAIL'
    };
  }
}

async function runLane2_CacheProof() {
  log('\n💾 LANE 2: Cache Proof (cold → warm → compare)');

  try {
    const result = await runSkillTest('cache-proof', [
      `--story-id=${STORY_ID}-CACHE`,
      '--queries=golden_50',
      '--flush-cache',
      '--expected-hit-ratio=0.70'
    ]);

    return {
      lane: 'cache',
      status: 'PASS',
      story_id: `${STORY_ID}-CACHE`,
      timestamp: new Date().toISOString(),
      dry_run: DRY_RUN,
      verdict: DRY_RUN ? 'PENDING' : 'PASS'
    };
  } catch (error) {
    log(`Lane 2 failed: ${error.message}`, 'error');
    return {
      lane: 'cache',
      status: 'FAIL',
      error: error.message,
      verdict: 'FAIL'
    };
  }
}

async function runLane3_LiveAppProof() {
  log('\n🚀 LANE 3: Live App Proof (end-to-end)');

  try {
    const result = await runSkillTest('live-app-proof', [
      `--story-id=${STORY_ID}-LIVE`,
      '--queries=auth_handler,db_schema,api_routes,state_mgmt,error_handling',
      '--verify-all'
    ]);

    return {
      lane: 'live_app',
      status: 'PASS',
      story_id: `${STORY_ID}-LIVE`,
      timestamp: new Date().toISOString(),
      dry_run: DRY_RUN,
      verdict: DRY_RUN ? 'PENDING' : 'PASS'
    };
  } catch (error) {
    log(`Lane 3 failed: ${error.message}`, 'error');
    return {
      lane: 'live_app',
      status: 'FAIL',
      error: error.message,
      verdict: 'FAIL'
    };
  }
}

async function runLane4_CubicAdversarial() {
  log('\n⚔️  LANE 4: Cubic Adversarial Testing (4 axes × 8 tests)');

  try {
    const result = await runSkillTest('cubic-test', [
      `--story-id=${STORY_ID}-CUBIC`,
      '--axes=all'
    ]);

    return {
      lane: 'cubic',
      status: 'PASS',
      story_id: `${STORY_ID}-CUBIC`,
      timestamp: new Date().toISOString(),
      dry_run: DRY_RUN,
      verdict: DRY_RUN ? 'PENDING' : 'PASS'
    };
  } catch (error) {
    log(`Lane 4 failed: ${error.message}`, 'error');
    return {
      lane: 'cubic',
      status: 'FAIL',
      error: error.message,
      verdict: 'FAIL'
    };
  }
}

// ── Verdict Aggregation ────────────────────────────────────────────────────

function computeHierarchicalVerdict(laneResults) {
  const verdicts = {
    replay: laneResults.find(l => l.lane === 'replay')?.verdict || 'UNKNOWN',
    cache: laneResults.find(l => l.lane === 'cache')?.verdict || 'UNKNOWN',
    live_app: laneResults.find(l => l.lane === 'live_app')?.verdict || 'UNKNOWN',
    cubic: laneResults.find(l => l.lane === 'cubic')?.verdict || 'UNKNOWN'
  };

  const passCount = Object.values(verdicts).filter(v => v === 'PASS').length;
  const failCount = Object.values(verdicts).filter(v => v === 'FAIL').length;
  const pendingCount = Object.values(verdicts).filter(v => v === 'PENDING').length;

  let overall = 'UNKNOWN';
  if (failCount > 0) {
    overall = 'FAIL';
  } else if (passCount === 4) {
    overall = 'PASS';
  } else if (passCount >= 3 && pendingCount <= 1) {
    overall = 'PARTIAL';
  } else if (pendingCount > 0) {
    overall = 'PENDING';
  }

  return {
    by_lane: verdicts,
    pass_count: passCount,
    fail_count: failCount,
    pending_count: pendingCount,
    overall
  };
}

// ── Main Orchestration ─────────────────────────────────────────────────────

async function main() {
  ensureDir(REPORT_DIR);

  log('═══════════════════════════════════════════════════════════════');
  log('       PROOF OF TRUTH VERIFICATION ORCHESTRATOR');
  log('═══════════════════════════════════════════════════════════════');
  log(`Story ID:  ${STORY_ID}`);
  log(`Mode:      ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);
  log(`Tasks:     ${TASKS.join(', ')}`);
  log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const laneResults = [];

  // Run selected lanes
  if (TASKS.includes('replay')) {
    const result = await runLane1_ReplayProof();
    laneResults.push(result);
  }

  if (TASKS.includes('cache')) {
    const result = await runLane2_CacheProof();
    laneResults.push(result);
  }

  if (TASKS.includes('live')) {
    const result = await runLane3_LiveAppProof();
    laneResults.push(result);
  }

  if (TASKS.includes('cubic')) {
    const result = await runLane4_CubicAdversarial();
    laneResults.push(result);
  }

  // Compute hierarchical verdict
  const verdict = computeHierarchicalVerdict(laneResults);
  const elapsedMs = Date.now() - startTime;

  // Write report
  const report = {
    story_id: STORY_ID,
    timestamp: new Date().toISOString(),
    duration_ms: elapsedMs,
    dry_run: DRY_RUN,
    lanes: laneResults,
    verdict,
    can_promote: verdict.overall === 'PASS'
  };

  const reportPath = path.join(REPORT_DIR, `proof-${STORY_ID}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Summary
  log('\n═══════════════════════════════════════════════════════════════');
  log('                     PROOF VERDICT');
  log('═══════════════════════════════════════════════════════════════');
  log(`\nLane Results:`);
  log(`  Replay:        ${verdict.by_lane.replay}`);
  log(`  Cache:         ${verdict.by_lane.cache}`);
  log(`  Live App:      ${verdict.by_lane.live_app}`);
  log(`  Cubic:         ${verdict.by_lane.cubic}`);
  log(`\nOverall:       ${verdict.overall}`);
  log(`Pass Count:    ${verdict.pass_count}/4`);
  log(`Fail Count:    ${verdict.fail_count}/4`);
  log(`\nPromotion OK:  ${report.can_promote ? '✅ YES' : '❌ NO'}`);
  log(`Duration:      ${(elapsedMs / 1000).toFixed(1)}s`);
  log(`Report:        ${reportPath}`);
  log('═══════════════════════════════════════════════════════════════\n');

  if (verdict.overall === 'FAIL') {
    log('❌ Proof verification FAILED. Feature CANNOT be promoted.', 'error');
    process.exit(1);
  } else if (verdict.overall === 'PASS') {
    log('✅ Proof verification PASSED. Feature CAN be promoted.', 'info');
    process.exit(0);
  } else {
    log('⚠️  Proof verification PARTIAL or PENDING. Review before promoting.', 'warn');
    process.exit(0);
  }
}

main().catch(error => {
  log(`Orchestrator error: ${error.message}`, 'error');
  process.exit(1);
});
