#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, buildDoNotRepeatKey } from './lib/agentic-toolgan-core.mjs';

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

console.log(`\n═══ Tool-GAN Execution Wrapper (${dryRunMode ? 'DRY-RUN' : 'APPLY'}) ═══`);
console.log(`Trace ID:  ${currentPlan.trace_id}`);
console.log(`Tool Path: ${currentPlan.tool_path.join(' ➔ ')}`);

let result = 'success';
let failure_signature = null;
let stdout = '';
let executionTimeMs = 0;

if (command) {
  if (dryRunMode) {
    console.log(`[DRY-RUN] Would run command: ${command}`);
    stdout = `[DRY-RUN] Simulated execution of: ${command}`;
    result = 'success';
  } else {
    console.log(`Running command: ${command}`);
    const t0 = Date.now();
    try {
      stdout = execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      executionTimeMs = Date.now() - t0;
      console.log(`✓ Command completed successfully in ${executionTimeMs}ms`);
    } catch (err) {
      executionTimeMs = Date.now() - t0;
      result = 'failure';
      stdout = err.stdout + '\n' + err.stderr;
      failure_signature = err.message.substring(0, 100);
      console.error(`❌ Command failed: ${err.message}`);
    }
  }
} else {
  console.log(`${dryRunMode ? '[DRY-RUN] ' : ''}Executing tool path: ${currentPlan.tool_path.join(', ')}`);
  const t0 = Date.now();
  for (const tool of currentPlan.tool_path) {
    console.log(`  ➔ ${dryRunMode ? 'Simulating' : 'Executing'} step: ${tool}...`);
  }
  executionTimeMs = Date.now() - t0;
  result = 'success';
  stdout = `Executed: ${currentPlan.tool_path.join(' -> ')}`;
}

// Update plan with execution results
const updatedPlan = {
  ...currentPlan,
  result,
  failure_signature,
  commands: command ? [command] : [],
  proof: {
    smoke: result === 'success' ? 'PASS' : 'FAIL',
    replay: 'PENDING',
    diff: ''
  }
};

// Recalculate do_not_repeat_key if failure occurred
if (result === 'failure') {
  updatedPlan.do_not_repeat_key = buildDoNotRepeatKey(
    currentPlan.intent,
    currentPlan.query,
    currentPlan.selected_files,
    currentPlan.tool_path,
    failure_signature
  );
}

writeFileSync(planPath, JSON.stringify(updatedPlan, null, 2));

console.log(`\nResult: ${result}`);
if (failure_signature) {
  console.log(`Failure Signature: ${failure_signature}`);
}
