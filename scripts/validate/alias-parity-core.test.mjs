import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAliasMappings } from './alias-parity-core.mjs';

const row = (alias_key, canonical_packet_key, alias_kind = 'k') => ({ alias_key, canonical_packet_key, alias_kind });
const verdict = (out, key) => out.results.find((r) => r.alias_key === key).verdict;

test('exact match, legacy-only and proposed-only are distinguished', () => {
  const out = compareAliasMappings({ legacy: [row('a', 'P1'), row('b', 'P2')], proposed: [row('a', 'P1'), row('c', 'P3')] });
  assert.equal(verdict(out, 'a'), 'EXACT_MATCH');
  assert.equal(verdict(out, 'b'), 'LEGACY_ONLY');
  assert.equal(verdict(out, 'c'), 'PROPOSED_ONLY');
  assert.equal(out.conflictFree, true);
  assert.equal(out.coverageComplete, false);
});

test('same alias to a different canonical key is a blocking conflict', () => {
  const out = compareAliasMappings({ legacy: [row('a', 'P1')], proposed: [row('a', 'P9')] });
  assert.equal(verdict(out, 'a'), 'CANONICAL_KEY_CONFLICT');
  assert.equal(out.conflictFree, false);
});

test('same canonical but different alias kind is a kind conflict', () => {
  const out = compareAliasMappings({ legacy: [row('a', 'P1', 'x')], proposed: [row('a', 'P1', 'y')] });
  assert.equal(verdict(out, 'a'), 'ALIAS_KIND_CONFLICT');
});

test('duplicate alias keys on either side block rather than pick one', () => {
  assert.equal(verdict(compareAliasMappings({ legacy: [row('a', 'P1'), row('a', 'P2')], proposed: [] }), 'a'), 'LEGACY_DUPLICATE_ALIAS_KEY');
  assert.equal(verdict(compareAliasMappings({ legacy: [], proposed: [row('a', 'P1'), row('a', 'P2')] }), 'a'), 'PROPOSED_DUPLICATE_ALIAS_KEY');
});

test('identical sets are conflict-free and coverage-complete; empty inputs too', () => {
  const same = [row('a', 'P1')];
  const out = compareAliasMappings({ legacy: same, proposed: same });
  assert.equal(out.conflictFree && out.coverageComplete, true);
  assert.equal(compareAliasMappings({ legacy: [], proposed: [] }).results.length, 0);
});

test('result order is deterministic regardless of input order', () => {
  const a = compareAliasMappings({ legacy: [row('b', 'P'), row('a', 'P')], proposed: [] });
  const b = compareAliasMappings({ legacy: [row('a', 'P'), row('b', 'P')], proposed: [] });
  assert.deepEqual(a.results, b.results);
});
