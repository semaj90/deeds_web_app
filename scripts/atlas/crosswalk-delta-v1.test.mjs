import test from 'node:test';
import assert from 'node:assert/strict';
import { diffCrosswalk, applyDelta, verifyDelta, rowIdentity } from './crosswalk-delta-v1.mjs';

const row = (i, over = {}) => ({ ordinal: i, taskId: `openspec/changes/c/tasks.md#L${i + 1}`, source: 'openspec/changes/c/tasks.md', line: i + 1, stableKey: `c#${String(i).padStart(16, '0')}`, workboardState: 'OPEN', status: 'MATCHED_EXACT', ...over });
const rows = (n) => Array.from({ length: n }, (_, i) => row(i));

test('identical crosswalks produce an empty delta', () => {
  const { ops, unchanged } = diffCrosswalk(rows(100), rows(100));
  assert.equal(ops.length, 0);
  assert.equal(unchanged, 100);
});

test('inserting one row early shifts every ordinal but yields exactly one op (ordinals are not identity)', () => {
  const prev = rows(1000);
  const next = [row(0, { stableKey: 'c#new0000000000000', taskId: 'openspec/changes/c/tasks.md#L9999', line: 9999 }), ...prev].map((r, i) => ({ ...r, ordinal: i }));
  const { ops, unchanged } = diffCrosswalk(prev, next);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'ADDED');
  assert.equal(unchanged, 1000);
  assert.equal(verifyDelta(prev, next, ops), true);
});

test('a moved line with the same stableKey is one CHANGED op carrying before and after', () => {
  const prev = rows(50);
  const next = prev.map((r) => (r.ordinal === 7 ? { ...r, taskId: 'openspec/changes/c/tasks.md#L70', line: 70, status: 'RESOLVED_BY_TEXT' } : r));
  const { ops } = diffCrosswalk(prev, next);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'CHANGED');
  assert.equal(ops[0].before.line, 8);
  assert.equal(ops[0].after.line, 70);
});

test('removed rows are REMOVED', () => {
  const prev = rows(10);
  const { ops } = diffCrosswalk(prev, prev.slice(0, 8));
  assert.deepEqual(ops.map((o) => o.op), ['REMOVED', 'REMOVED']);
});

test('an unresolved row that becomes resolved switches identity: REMOVED(tid) + ADDED(sk), never an in-place edit', () => {
  const unresolved = { ordinal: 0, taskId: 'openspec/changes/x/tasks.md#L3', source: 'openspec/changes/x/tasks.md', line: 3, stableKey: null, workboardState: null, status: 'NEW_SINCE_WORKBOARD' };
  const resolved = { ...unresolved, stableKey: 'x#abcdabcdabcdabcd', workboardState: 'OPEN', status: 'MATCHED_EXACT' };
  assert.equal(rowIdentity(unresolved), 'tid:openspec/changes/x/tasks.md#L3');
  assert.equal(rowIdentity(resolved), 'sk:x#abcdabcdabcdabcd');
  const { ops } = diffCrosswalk([unresolved], [resolved]);
  assert.deepEqual(ops.map((o) => o.op).sort(), ['ADDED', 'REMOVED']);
  assert.equal(verifyDelta([unresolved], [resolved], ops), true);
});

test('duplicate identities on either side are refused', () => {
  const dup = [row(1), row(1, { ordinal: 2 })];
  assert.throws(() => diffCrosswalk(dup, rows(2)), /CROSSWALK_DUPLICATE_IDENTITY_PREV/);
  assert.throws(() => diffCrosswalk(rows(2), dup), /CROSSWALK_DUPLICATE_IDENTITY_NEXT/);
});

test('apply reproduces NEXT; a tampered delta fails verification and bad ops throw', () => {
  const prev = rows(30);
  const next = [...prev.filter((r) => r.ordinal !== 3), row(99, { ordinal: 29, stableKey: 'c#9999999999999999', taskId: 'openspec/changes/c/tasks.md#L100', line: 100 })]
    .map((r) => (r.ordinal === 5 ? { ...r, workboardState: 'DONE' } : r));
  const { ops } = diffCrosswalk(prev, next);
  assert.equal(ops.length, 3); // REMOVED, CHANGED, ADDED
  assert.equal(verifyDelta(prev, next, ops), true);
  const tampered = ops.map((o) => (o.op === 'CHANGED' ? { ...o, after: { ...o.after, status: 'MATCHED_EXACT_FORGED' } } : o));
  assert.equal(verifyDelta(prev, next, tampered), false);
  assert.throws(() => applyDelta(prev, [{ op: 'REMOVED', key: 'sk:nope' }]), /DELTA_REMOVE_MISSING/);
  assert.throws(() => applyDelta(prev, [{ op: 'ADDED', key: rowIdentity(prev[0]), after: prev[0] }]), /DELTA_ADD_EXISTS/);
  assert.throws(() => applyDelta(prev, [{ op: 'CHANGED', key: 'sk:nope', after: {} }]), /DELTA_CHANGE_MISSING/);
  assert.throws(() => applyDelta(prev, [{ op: 'WIPE', key: 'x' }]), /DELTA_UNKNOWN_OP/);
});
