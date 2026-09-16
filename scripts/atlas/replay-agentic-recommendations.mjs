#!/usr/bin/env node
// AGENTIC-GOVERNED-REPLAY-01: this script is READ-ONLY BY CONSTRUCTION. There is no code
// path in this file that calls writeFileSync or mutates card.status -- that capability was
// removed, not merely gated behind a flag that happened to always evaluate false. Recommendation
// strings (recommended_commands/verification_commands) are inert diagnostic text; they were never
// executed by this file even before this pass (execSync was already removed under
// AGENTIC-LEGACY-EXECUTION-CENSUS-01). Governed apply/verification -- writing a card to
// 'verified' after real command execution -- requires a WorkflowActionEventV1 + an approved
// mutation-approval receipt, and belongs to a separate governed executor that does not exist yet
// (tracked as AGENTIC-GOVERNED-REPLAY-PROOF-02). Do not re-add a write path here to "finish" this
// script; wire the governed executor as its own module instead.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

if (!existsSync(workflowPath)) {
  console.error(`❌ Recommendation workflow index not found at ${workflowPath}`);
  process.exit(1);
}

const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
const cards = Array.isArray(workflow)
  ? workflow
  : Array.isArray(workflow.top)
    ? workflow.top
    : [];

if (process.argv.includes('--apply')) {
  console.error('REPLAY_EXECUTION_REQUIRES_GOVERNED_APPROVAL');
  console.error('Recommendation strings are not executable authorization. This script has no apply mode. Use the governed workflow-action replay after an approved mutation plan and receipt are present.');
  process.exit(2);
}

console.log(`\n═══ Replay Agentic Recommendations (DRY-RUN, read-only) ═══`);

for (const card of cards) {
  if (card.status === 'verified') {
    console.log(`- Card ${card.task_id} is already VERIFIED. Skipping.`);
    continue;
  }

  console.log(`\nReplaying card ${card.task_id} ("${card.query || card.title || card.task_id}")...`);

  for (const cmd of card.recommended_commands || []) {
    console.log(`  [DRY-RUN] Would run: ${cmd}`);
  }
  for (const cmd of card.verification_commands || []) {
    console.log(`  [DRY-RUN] Would verify: ${cmd}`);
  }
}

console.log(`\n[DRY-RUN] No records modified in index. This script cannot write ${path.relative(ROOT, workflowPath)}.`);
