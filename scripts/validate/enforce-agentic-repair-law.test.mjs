import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgenticRepairReceipt } from './enforce-agentic-repair-law.mjs';

const STAGES = ['1_VERIFIED_CLAIM', '2_KERNEL_DAG_CANDIDATE', '3_SCHEMA_LINEAGE_ADMISSION', '4_BOUNDED_EXECUTION', '5_INDEPENDENT_READBACK'];

function validReceipt(overrides = {}) {
  const stages = {};
  for (const s of STAGES) stages[s] = { completed: true };
  stages['3_SCHEMA_LINEAGE_ADMISSION'].okfProfile = 'atlas.okf-reconciliation-by-cause.v1';
  stages['5_INDEPENDENT_READBACK'].verificationExitCode = 0;
  return { stages, liveDbMutated: false, seaweedOverwrites: 0, ...overrides };
}

function run(receipt) {
  const dir = mkdtempSync(join(tmpdir(), 'repair-law-'));
  const file = join(dir, 'receipt.json');
  writeFileSync(file, JSON.stringify(receipt), 'utf8');
  return validateAgenticRepairReceipt(file);
}

test('a complete receipt passes', () => {
  const result = run(validReceipt());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('each missing stage fails', () => {
  for (const s of STAGES) {
    const r = validReceipt();
    r.stages[s].completed = false;
    const result = run(r);
    assert.equal(result.valid, false, s);
    assert.ok(result.errors.some((e) => e.includes(s)), s);
  }
});

test('wrong OKF profile fails stage 3', () => {
  const r = validReceipt();
  r.stages['3_SCHEMA_LINEAGE_ADMISSION'].okfProfile = 'something-else';
  assert.equal(run(r).valid, false);
});

test('reported live DB mutation fails', () => {
  assert.equal(run(validReceipt({ liveDbMutated: true })).valid, false);
});

test('reported SeaweedFS overwrite fails', () => {
  assert.equal(run(validReceipt({ seaweedOverwrites: 2 })).valid, false);
});

test('stage 5 non-zero exit fails', () => {
  const r = validReceipt();
  r.stages['5_INDEPENDENT_READBACK'].verificationExitCode = 1;
  assert.equal(run(r).valid, false);
});
