import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { phaseFromStdout } from './run-openspec-evidence-fabric-v1.mjs';

test('importing the runner does not start the pipeline (entry-point guard)', () => {
  assert.equal(typeof phaseFromStdout, 'function');
});

test('phase counters are merged only from a structured phaseReceipt and only whitelisted fields', () => {
  const out = JSON.stringify({ x: 1, phaseReceipt: { inputRevision: 'r', outputRevision: 'o', inputCount: 10, dirtyCount: 2, skippedUnchangedCount: 8, writesPerformed: false, secret: 'nope' } });
  assert.deepEqual(phaseFromStdout(out), { phase: { inputRevision: 'r', outputRevision: 'o', inputCount: 10, dirtyCount: 2, skippedUnchangedCount: 8, writesPerformed: false } });
});

test('stages that print nothing structured are unchanged', () => {
  assert.deepEqual(phaseFromStdout('plain text'), {});
  assert.deepEqual(phaseFromStdout(JSON.stringify({ schema: 'x' })), {});
  assert.deepEqual(phaseFromStdout(JSON.stringify({ phaseReceipt: 5 })), {});
});

test('the dirty-set stage is registered once, read-only, after card compilation and before packets', () => {
  const src = readFileSync(new URL('./run-openspec-evidence-fabric-v1.mjs', import.meta.url), 'utf8');
  const order = [...src.matchAll(/\['(EVF-05[A-Z_]*)',/g)].map((m) => m[1]);
  assert.deepEqual(order, ['EVF-05_CARD_COMPILATION', 'EVF-05B_DIRTY_SET', 'EVF-05_FEATURE_PACKET_COMPILATION']);
  assert.equal((src.match(/'EVF-05B_DIRTY_SET'/g) ?? []).length, 1);
  assert.ok(src.includes('OPENSPEC_DIRTY_SET_OUTPUT'));
  assert.ok(!/--write-snapshot/.test(src.replace(/\/\/[^\n]*/g, '')), 'the runner must never write the baseline');
});

test('the worker cap is unchanged: default 2, hard cap 3', () => {
  const src = readFileSync(new URL('./run-openspec-evidence-fabric-v1.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('Math.min(2, Math.max(1, available - 1))'));
  assert.ok(src.includes('Math.min(3, configured)'));
});
