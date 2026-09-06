#!/usr/bin/env node

/** Read-only dry-run and fail-closed proof for the Ornith boundary. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(root, 'scripts', 'atlas', 'run-parent-atlas-workstation-ornith-synthesis-dry-v1.mjs');
const receiptPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const run = (endpoint) => {
  const result = spawnSync(process.execPath, [runner, `--endpoint=${endpoint}`], { cwd: root, encoding: 'utf8' });
  return { exitCode: result.status, receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')) };
};
const live = run('http://127.0.0.1:8090');
const unavailable = run('http://127.0.0.1:1');
const proof = {
  schema: 'atlas.parent-atlas-workstation-ornith-synthesis-proof.v1',
  status: live.receipt.status === 'SKIPPED_NO_EXECUTABLE_CANDIDATE' && live.receipt.loadedModel && /^ornith-1\.5/i.test(live.receipt.loadedModel) && live.receipt.modelCalls === 0 && unavailable.receipt.status === 'RUNTIME_UNAVAILABLE' && unavailable.exitCode !== 0 ? 'PROVEN' : 'FAILED',
  liveStatus: live.receipt.status,
  liveModel: live.receipt.loadedModel,
  liveModelCalls: live.receipt.modelCalls,
  noCandidateSkip: live.receipt.status === 'SKIPPED_NO_EXECUTABLE_CANDIDATE',
  unavailableFailClosed: unavailable.receipt.status === 'RUNTIME_UNAVAILABLE' && unavailable.exitCode !== 0,
  noFallback: unavailable.receipt.loadedModel === null,
  writes: live.receipt.writes,
  receiptPath: 'docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json',
};
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-proof-v1.json');
fs.writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out }, null, 2));
if (proof.status !== 'PROVEN') process.exitCode = 1;
