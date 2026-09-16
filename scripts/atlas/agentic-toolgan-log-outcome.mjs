#!/usr/bin/env node
// AGENTIC-TOOLGAN-GOVERNED-BOUNDARY-01: refuses to launder a simulated (never actually run)
// plan into the permanent success/failure/do-not-repeat ledgers. agentic-toolgan-execute.mjs's
// simulation-only branch (its only branch, per that file's own fix) marks a plan
// `proof.smoke === 'NOT_EXECUTED'` / `result === null` -- that plan is not evidence that
// anything happened, so this file must not append it to successes.ndjson, failures.ndjson, or
// do-not-repeat.ndjson as if it were. It is still written to timeline.ndjson (an append-only
// activity log, not a success/failure verdict store), so the proposal is not silently lost.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, appendNdjson, buildDoNotRepeatKey, writeTimelineEvent } from './lib/agentic-toolgan-core.mjs';

const planPath = path.join(ROOT, '.tmp', 'toolgan-current-plan.json');

if (!existsSync(planPath)) {
  console.error(`❌ Current plan not found at ${planPath}`);
  process.exit(1);
}

const currentPlan = JSON.parse(readFileSync(planPath, 'utf8'));

if (currentPlan.proof?.smoke === 'NOT_EXECUTED' || currentPlan.result === null || currentPlan.result === undefined) {
  writeTimelineEvent(currentPlan);
  console.log('✓ Logged to memory/agentic/timeline.ndjson (activity log only)');
  console.error('\nAGENTIC_TOOLGAN_OUTCOME_NOT_LOGGED_NO_REAL_EXECUTION_PROOF');
  console.error('This plan was never actually executed (proof.smoke=NOT_EXECUTED / result=null) -- it is not written to successes.ndjson, failures.ndjson, or do-not-repeat.ndjson. Only a governed executor with real execution proof may produce a success/failure verdict.');
  process.exit(2);
}

// Recalculate do_not_repeat_key now that result and failure_signature are known
const updatedKey = buildDoNotRepeatKey(
  currentPlan.intent,
  currentPlan.query,
  currentPlan.selected_files,
  currentPlan.tool_path,
  currentPlan.failure_signature
);

currentPlan.do_not_repeat_key = updatedKey;

// Save updated plan back
writeFileSync(planPath, JSON.stringify(currentPlan, null, 2));

const failuresPath = path.join(ROOT, 'memory', 'agentic', 'failures.ndjson');
const successesPath = path.join(ROOT, 'memory', 'agentic', 'successes.ndjson');
const dnrPath = path.join(ROOT, 'memory', 'agentic', 'do-not-repeat.ndjson');

// Write to timeline and outcome-ledger
writeTimelineEvent(currentPlan);
console.log(`✓ Logged to memory/agentic/timeline.ndjson and .opencode/outcome-ledger.ndjson`);

if (currentPlan.result === 'success') {
  appendNdjson(successesPath, currentPlan);
  console.log(`✓ Logged to memory/agentic/successes.ndjson`);
  
  // Log to DNR
  appendNdjson(dnrPath, {
    do_not_repeat_key: currentPlan.do_not_repeat_key,
    result: 'success',
    ts: currentPlan.ts,
    outcome: 'Success cached.'
  });
  console.log(`✓ Logged to memory/agentic/do-not-repeat.ndjson`);
} else {
  appendNdjson(failuresPath, currentPlan);
  console.log(`✓ Logged to memory/agentic/failures.ndjson`);
  
  // Log to DNR with failure details
  appendNdjson(dnrPath, {
    do_not_repeat_key: currentPlan.do_not_repeat_key,
    result: 'failure',
    ts: currentPlan.ts,
    failure_signature: currentPlan.failure_signature
  });
  console.log(`✓ Logged failure signature to memory/agentic/do-not-repeat.ndjson`);
}
