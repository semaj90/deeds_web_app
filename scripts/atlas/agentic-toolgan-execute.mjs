#!/usr/bin/env node
// AGENTIC-TOOLGAN-GOVERNED-BOUNDARY-01: --apply already fails closed below before any command
// could run. The remaining bug this pass fixes: the simulation-only branch below used to write
// result:'success' and proof.smoke:'PASS' to disk UNCONDITIONALLY -- even though it never runs
// any real command -- and that fabricated "success" was then permanently persisted by
// agentic-toolgan-log-outcome.mjs into memory/agentic/successes.ndjson and
// memory/agentic/do-not-repeat.ndjson as if it were real execution evidence. A tool path that
// was only ever *simulated* must never be indistinguishable from one that actually ran and
// passed. Simulated runs now write result:null / proof.smoke:'NOT_EXECUTED', and
// agentic-toolgan-log-outcome.mjs refuses to write to the permanent success/failure/DNR ledgers
// for a plan that carries that marker (see the fix there).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/agentic-toolgan-core.mjs';

const planPath = path.join(ROOT, '.tmp', 'toolgan-current-plan.json');

if (!existsSync(planPath)) {
  console.error(`❌ Current plan not found at ${planPath}`);
  process.exit(1);
}

const currentPlan = JSON.parse(readFileSync(planPath, 'utf8'));

// Accept command from argv
const cmdArg = process.argv.find(a => a.startsWith('--cmd='));
const command = cmdArg ? cmdArg.split('=')[1] : null;

// Determine if we should apply or dry-run (default: dry-run)
const applyMode = process.argv.includes('--apply');
const dryRunMode = !applyMode || process.argv.includes('--dry-run');

if (applyMode && !dryRunMode) {
  console.error('TOOLGAN_APPLY_REQUIRES_GOVERNED_MUTATION_RECEIPT');
  console.error('This legacy wrapper is proposal-only; no shell command may be executed here.');
  process.exit(2);
}

console.log(`\n═══ Tool-GAN Execution Wrapper (${dryRunMode ? 'DRY-RUN' : 'APPLY'}) ═══`);
console.log(`Trace ID:  ${currentPlan.trace_id}`);
console.log(`Tool Path: ${currentPlan.tool_path.join(' ➔ ')}`);

// Nothing below this point ever actually runs `command` or `currentPlan.tool_path` -- it only
// prints what WOULD run. `result` therefore stays null (not "success", not "failure") until a
// real governed executor produces real proof; a plan carrying this marker is not admissible
// evidence of anything having happened.
const result = null;
const failure_signature = null;
let stdout = '';

if (command) {
  console.log(`[NOT EXECUTED] Would run command: ${command}`);
  stdout = `[NOT EXECUTED] Simulated (not run): ${command}`;
} else {
  console.log(`[NOT EXECUTED] Would run tool path: ${currentPlan.tool_path.join(', ')}`);
  for (const tool of currentPlan.tool_path) {
    console.log(`  ➔ Simulating step (not run): ${tool}...`);
  }
  stdout = `[NOT EXECUTED] Simulated (not run): ${currentPlan.tool_path.join(' -> ')}`;
}

// Update plan with the (non-)execution marker. Never fabricate a do_not_repeat_key here --
// that key is keyed on a real failure_signature, and this path never produces one.
const updatedPlan = {
  ...currentPlan,
  result,
  failure_signature,
  commands: command ? [command] : [],
  proof: {
    smoke: 'NOT_EXECUTED',
    replay: 'PENDING',
    diff: ''
  }
};

writeFileSync(planPath, JSON.stringify(updatedPlan, null, 2));

console.log(`\nResult: NOT_EXECUTED (proposal-only; no command was actually run)`);
console.log(stdout);
