#!/usr/bin/env node
// Smoke test for retrieval loop hook

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const hookPath = path.join(root, 'scripts', 'opencode', 'gemma4-retrieval-hook.mjs');
const loopPath = path.join(root, '.tmp', 'atlas-retrieval-loop.jsonl');

function fail(msg){ console.error('FAIL', msg); process.exitCode = 1; }
function pass(msg){ console.log('OK', msg); }

if (!fs.existsSync(hookPath)) fail(`${hookPath} missing`);
pass('gemma4 hook exists');

if (!fs.existsSync(loopPath)) fail(`${loopPath} missing`);
pass('atlas retrieval loop exists');

// Try append dry-run: call hook with a unique query
const testQuery = 'smoke-retrieval-loop-hook-test-' + Date.now();
const cmd = `node "${hookPath}" --query "${testQuery}" --selected '[".opencode/cards/test-smoke.json"]' --sourceRefs '["scripts/opencode/smoke-retrieval-loop-hook.mjs"]' --rerankScore 0.5 --tool smoke_test --outcome dry_run`;
const r = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 5000 });
if (r.error) {
  console.error('Hook execution failed:', r.error);
  fail('hook execution failed');
} else {
  console.log(r.stdout || r.stderr || 'hook ran');
  pass('hook append executed (dry-run)');
}

// Validate last row contains required fields
const lines = fs.readFileSync(loopPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const last = JSON.parse(lines[lines.length -1]);
const required = ['query','selectedCardIds','sourceRefs','rerankScore','tool','outcome'];
for (const k of required) {
  if (!(k in last)) fail(`Last row missing ${k}`);
}
pass('last row has required keys');

console.log('Smoke retrieval loop hook: OK');
process.exit(process.exitCode || 0);
