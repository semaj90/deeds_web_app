#!/usr/bin/env node
/**
 * Agentic Task Claim: Register task with ledger before work
 *
 * Prevents duplicate/concurrent agent work on same task/files.
 * Must run BEFORE any file creation.
 *
 * Usage:
 *   node scripts/agentic/claim-task.mjs \
 *     --task-id=P3G-QDRANT-CLASSIFY \
 *     --story-id=P3G-QDRANT \
 *     --agent=claude \
 *     --files=scripts/atlas/classify-qdrant-missing-packets.mjs
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const LEDGER_PATH = 'docs/reports/agent-task-claims.json';

// Parse args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val;
  return acc;
}, {});

const { 'task-id': taskId, 'story-id': storyId, agent, files } = args;

if (!taskId || !storyId || !agent || !files) {
  console.error('Missing required args: --task-id --story-id --agent --files');
  process.exit(1);
}

const filesList = files.split(',').map(f => f.trim());

// Load or create ledger
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

// Check for active claim conflicts
function checkConflicts(ledger, taskId, filesList) {
  const conflicts = [];

  for (const entry of ledger) {
    // Same task already claimed?
    if (entry.task_id === taskId && ['CLAIMED', 'VERIFYING'].includes(entry.status)) {
      conflicts.push({
        type: 'TASK_CONFLICT',
        message: `Task ${taskId} already claimed by agent ${entry.agent}`,
        entry
      });
    }

    // File overlap?
    const overlap = filesList.filter(f => entry.files_intended?.includes(f));
    if (overlap.length > 0 && ['CLAIMED', 'VERIFYING'].includes(entry.status)) {
      conflicts.push({
        type: 'FILE_CONFLICT',
        message: `Files ${overlap.join(', ')} already claimed by agent ${entry.agent}`,
        entry,
        conflicting_files: overlap
      });
    }
  }

  return conflicts;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AGENTIC TASK CLAIM');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const ledger = loadLedger();
  console.log(`📋 Ledger loaded: ${ledger.length} entries`);
  console.log();

  // Check conflicts
  const conflicts = checkConflicts(ledger, taskId, filesList);
  if (conflicts.length > 0) {
    console.log('❌ CONFLICTS DETECTED:');
    for (const conflict of conflicts) {
      console.log(`  - ${conflict.type}: ${conflict.message}`);
    }
    console.log();
    process.exit(1);
  }

  // Check if already claimed by this agent (idempotent)
  const existing = ledger.find(e => e.task_id === taskId && e.agent === agent);
  if (existing) {
    console.log(`✅ Already claimed by ${agent} (idempotent)`);
    console.log(`   Status: ${existing.status}`);
    console.log();
    saveLedger(ledger); // update timestamp
    process.exit(0);
  }

  // Create claim hash (of task spec)
  const claimSpec = JSON.stringify({ taskId, storyId, files: filesList });
  const claimHash = crypto.createHash('sha256').update(claimSpec).digest('hex').slice(0, 12);

  // Add claim
  const claim = {
    task_id: taskId,
    story_id: storyId,
    agent,
    status: 'CLAIMED',
    files_intended: filesList,
    claim_hash: claimHash,
    supersedes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  ledger.push(claim);
  saveLedger(ledger);

  console.log('✅ TASK CLAIMED');
  console.log();
  console.log(`  Task ID: ${taskId}`);
  console.log(`  Story ID: ${storyId}`);
  console.log(`  Agent: ${agent}`);
  console.log(`  Files: ${filesList.join(', ')}`);
  console.log(`  Claim Hash: ${claimHash}`);
  console.log();
  console.log(`📄 Ledger: ${LEDGER_PATH}`);
  console.log();
  console.log('Next: Run audit-supersedes to check for duplicates');
  console.log('  npm run agent:supersedes:audit -- --task-id=' + taskId);
  console.log();
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
