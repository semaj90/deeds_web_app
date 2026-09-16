#!/usr/bin/env node
// AGENTIC-TOOLGAN-GOVERNED-BOUNDARY-01: this verifier is DIAGNOSTIC/SHAPE-ONLY BY CONSTRUCTION.
// The committed baseline (git HEAD before this fix) re-executed every recorded command via
// execSync and, if all of them happened to exit 0, printed "REPLAY SUCCESS: Deterministic
// execution verified!" -- treating historical command re-execution as proof. There is no
// execSync/execFile/spawn anywhere in this file now, in any mode, including `--test`: `--test`
// only adds a log line (see below) and does not skip validation or the unconditional exit(2) at
// the end -- it must never auto-pass.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readNdjson } from './lib/agentic-toolgan-core.mjs';

const isTest = process.argv.includes('--test');

function getArgValue(argKey, argvList) {
  const index = argvList.findIndex(a => a.startsWith(argKey));
  if (index === -1) return null;
  const arg = argvList[index];
  if (arg.includes('=')) {
    return arg.split('=')[1];
  }
  if (index + 1 < argvList.length && !argvList[index + 1].startsWith('--')) {
    return argvList[index + 1];
  }
  return '';
}

const traceId = getArgValue('--trace_id', process.argv);

console.log(`\n═══ Tool-GAN Replay Proof Verification ═══`);

if (isTest) console.log('[REPLAY-TEST] Shape-only verification; commands are never executed.');

if (!traceId) {
  console.error(`❌ Please supply a trace_id to replay: --trace_id=<uuid>`);
  process.exit(1);
}

const timelinePath = path.join(ROOT, 'memory', 'agentic', 'timeline.ndjson');

if (!existsSync(timelinePath)) {
  console.error(`❌ Timeline file not found at ${timelinePath}`);
  process.exit(1);
}

const events = readNdjson(timelinePath);
const targetEvent = events.find(e => e.trace_id === traceId);

if (!targetEvent) {
  console.error(`❌ Event with trace_id=${traceId} not found in timeline.`);
  process.exit(1);
}

console.log(`Target Event Query: "${targetEvent.query}"`);
console.log(`Replaying Tool Path: ${targetEvent.tool_path.join(' ➔ ')}`);

const commands = Array.isArray(targetEvent.commands) ? targetEvent.commands : [];
console.log(`Recorded commands: ${commands.length}`);
console.error('\nREPLAY_NOT_EXECUTED_GOVERNED_APPROVAL_REQUIRED');
console.error('This legacy verifier only inspects the recorded event; it cannot prove command execution.');
process.exit(2);
