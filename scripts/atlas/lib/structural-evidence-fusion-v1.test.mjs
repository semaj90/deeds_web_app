import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseObservations } from './structural-evidence-fusion-v1.mjs';

const groupOf = (s) => ({ 'ast-grep-cli': 'tree-sitter', 'ast-grep-napi': 'tree-sitter', 'svelte-compiler': 'svelte-compiler' })[s];
const o = (source, startByte, endByte, name = '$state', kind = 'RUNE_CALL') => ({ source, kind, name, startByte, endByte });

test('two sources in one independence group are a single witness, not agreement', () => {
  const r = fuseObservations([o('ast-grep-cli', 10, 20), o('ast-grep-napi', 10, 20)], { groupOf });
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].status, 'SINGLE_GROUP');
  assert.deepEqual(r.facts[0].sources, ['ast-grep-cli', 'ast-grep-napi']);
  assert.deepEqual(r.facts[0].independentGroups, ['tree-sitter']);
});

test('independent groups reporting the same byte-addressed fact agree', () => {
  const r = fuseObservations([o('ast-grep-cli', 10, 20), o('svelte-compiler', 10, 20)], { groupOf });
  assert.equal(r.facts[0].status, 'AGREED_INDEPENDENT');
  assert.equal(r.facts[0].endByte, 20);
});

test('the same key with different end spans is a CONFLICT with both ends and their sources preserved', () => {
  const r = fuseObservations([o('ast-grep-cli', 10, 20), o('svelte-compiler', 10, 25)], { groupOf });
  assert.equal(r.facts[0].status, 'CONFLICT');
  assert.equal(r.facts[0].endByte, null);
  assert.deepEqual(r.facts[0].conflictingEnds.map((c) => c.endByte), [20, 25]);
});

test('a source without an end span does not create a conflict', () => {
  const r = fuseObservations([o('ast-grep-napi', 10, undefined), o('svelte-compiler', 10, 20)], { groupOf });
  assert.equal(r.facts[0].status, 'AGREED_INDEPENDENT');
  assert.equal(r.facts[0].endByte, 20);
});

test('different names or kinds at the same byte are separate facts; nothing is dropped', () => {
  const r = fuseObservations([o('ast-grep-cli', 5, 9, '$state'), o('svelte-compiler', 5, 9, '$derived'), o('svelte-compiler', 5, 9, '$state', 'OTHER')], { groupOf });
  assert.equal(r.facts.length, 3);
  assert.equal(Object.values(r.byStatus).reduce((a, b) => a + b, 0), 3);
});

test('independence must be declared, and bad spans are rejected, not coerced', () => {
  assert.throws(() => fuseObservations([o('ast-grep-cli', 1, 2)], {}), TypeError);
  assert.throws(() => fuseObservations([o('ast-grep-cli', -1, 2)], { groupOf }), RangeError);
  assert.throws(() => fuseObservations([o('ast-grep-cli', 1.5, 2)], { groupOf }), RangeError);
});

test('output is deterministic, ordered by byte position, and carries no authority or confidence', () => {
  const input = [o('svelte-compiler', 30, 40), o('ast-grep-cli', 10, 20), o('svelte-compiler', 10, 20)];
  const a = fuseObservations(input, { groupOf });
  const b = fuseObservations([...input].reverse(), { groupOf });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.facts.map((f) => f.startByte), [10, 30]);
  assert.equal(a.canonicalAuthority, false);
  assert.equal(a.writesPerformed, false);
  assert.ok(a.facts.every((f) => f.proposalOnly === true && !('confidence' in f)));
});
