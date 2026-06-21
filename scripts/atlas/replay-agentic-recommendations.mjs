#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

if (!existsSync(workflowPath)) {
  console.error(`❌ Recommendation workflow index not found at ${workflowPath}`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(workflowPath, 'utf8'));

const applyMode = process.argv.includes('--apply');
const dryRunMode = !applyMode || process.argv.includes('--dry-run');

console.log(`\n═══ Replay Agentic Recommendations (${dryRunMode ? 'DRY-RUN' : 'APPLY'}) ═══`);

let updatedCount = 0;

for (const card of cards) {
  if (card.status === 'verified') {
    console.log(`- Card ${card.task_id} is already VERIFIED. Skipping.`);
    continue;
  }

  console.log(`\nReplaying card ${card.task_id} ("${card.query}")...`);
  
  let success = true;
  
  // 1. Run recommended commands
  for (const cmd of card.recommended_commands || []) {
    if (dryRunMode) {
      console.log(`  [DRY-RUN] Would run: ${cmd}`);
    } else {
      console.log(`  Running recommended: ${cmd}`);
      try {
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
      } catch (err) {
        console.error(`  ❌ Recommended command failed: ${err.message}`);
        success = false;
      }
    }
  }

  // 2. Run verification commands
  for (const cmd of card.verification_commands || []) {
    if (dryRunMode) {
      console.log(`  [DRY-RUN] Would verify: ${cmd}`);
    } else {
      console.log(`  Running verification: ${cmd}`);
      try {
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
      } catch (err) {
        console.error(`  ❌ Verification command failed: ${err.message}`);
        success = false;
      }
    }
  }

  if (!dryRunMode) {
    if (success) {
      card.status = 'verified';
      console.log(`  ✅ Card ${card.task_id} status updated to VERIFIED.`);
      updatedCount++;
    } else {
      card.status = 'ready';
      console.log(`  ⚠️  Card ${card.task_id} failed verification. Status remains READY.`);
      updatedCount++;
    }
  }
}

if (!dryRunMode && updatedCount > 0) {
  writeFileSync(workflowPath, JSON.stringify(cards, null, 2));
  console.log(`\n✓ Workflow index saved with updated verified states.`);
} else {
  console.log(`\n[DRY-RUN] No records modified in index.`);
}
