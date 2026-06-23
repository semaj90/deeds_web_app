#!/usr/bin/env node
/**
 * Release Task Claim: Update ledger after work completes
 *
 * Marks task as VERIFYING/PASS/FAIL/SUPERSEDED.
 * Run AFTER verification gates pass/fail.
 *
 * Usage:
 *   node scripts/agentic/release-task-claim.mjs \
 *     --task-id=P3G-QDRANT-CLASSIFY \
 *     --status=PASS
 */

import fs from 'fs';
import path from 'path';

const LEDGER_PATH = 'docs/reports/agent-task-claims.json';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val;
  return acc;
}, {});

const { 'task-id': taskId, status } = args;
const validStatuses = ['VERIFYING', 'PASS', 'FAIL', 'SUPERSEDED'];

if (!taskId || !status || !validStatuses.includes(status)) {
  console.error(`Missing/invalid args: --task-id=<id> --status=${validStatuses.join('|')}`);
  process.exit(1);
}

// Load ledger
function loadLedger() {
  if (fs.existsSync(LEDGER_PATH)) {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  }
  return [];
}

// Save ledger
function saveLedger(ledger) {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RELEASE TASK CLAIM');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const ledger = loadLedger();
  const claim = ledger.find(e => e.task_id === taskId);

  if (!claim) {
    console.error(`❌ No claim found for task ${taskId}`);
    process.exit(1);
  }

  console.log(`📋 Updating: ${taskId}`);
  console.log(`  Status: ${claim.status} → ${status}`);
  console.log();

  claim.status = status;
  claim.updated_at = new Date().toISOString();

  saveLedger(ledger);

  console.log('✅ CLAIM RELEASED');
  console.log();
  console.log(`  Task ID: ${taskId}`);
  console.log(`  Status: ${status}`);
  console.log(`  Updated: ${claim.updated_at}`);
  console.log();

  if (status === 'PASS') {
    console.log('🎉 Task complete and verified.');
  } else if (status === 'FAIL') {
    console.log('❌ Task failed. Claim remains for investigation.');
  } else if (status === 'SUPERSEDED') {
    console.log('♻️  Task superseded by newer work.');
  }

  console.log();
  console.log(`📄 Ledger: ${LEDGER_PATH}`);
  console.log();
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
