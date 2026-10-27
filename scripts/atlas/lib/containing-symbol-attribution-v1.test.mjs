import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeContainingSymbol } from './containing-symbol-attribution-v1.mjs';

const REV = `sha256:${'a'.repeat(64)}`;
const row = (id, start, end, over = {}) => ({ stable_symbol_id: id, symbol_version_id: `v:${id}`, qualified_name: id, byte_start: String(start), byte_end: String(end), source_revision: REV, ...over });
const occ = (s, e) => ({ startByte: s, endByte: e });
const at = (rows, o) => attributeContainingSymbol(rows, o, { admittedRevision: REV });

test('innermost containing symbol wins (method inside class)', () => {
  const out = at([row('Class', 0, 500), row('Class.method', 100, 300)], occ(150, 160));
  assert.equal(out.stableSymbolId, 'Class.method');
  assert.equal(at([row('Class', 0, 500), row('Class.method', 100, 300)], occ(400, 410)).stableSymbolId, 'Class');
});

test('a use outside every symbol is not attributed; names are never used', () => {
  assert.equal(at([row('f', 100, 200)], occ(10, 20)).status, 'NO_CONTAINING_SYMBOL_VERSION');
  assert.equal(at([], occ(10, 20)).status, 'NO_SYMBOL_VERSIONS_FOR_FILE');
});

test('rows at another source revision are never used', () => {
  assert.equal(at([row('f', 0, 500, { source_revision: `sha256:${'b'.repeat(64)}` })], occ(10, 20)).status, 'ONLY_STALE_REVISION_ROWS');
});

test('same-span rows with different stable ids are ambiguous; same id twice is fine', () => {
  assert.equal(at([row('a', 0, 100), row('b', 0, 100)], occ(10, 20)).status, 'AMBIGUOUS');
  assert.equal(at([row('a', 0, 100), row('a', 0, 100, { symbol_version_id: 'v2' })], occ(10, 20)).status, 'ATTRIBUTED');
});

test('boundary containment is inclusive and invalid spans are rejected', () => {
  assert.equal(at([row('f', 10, 20)], occ(10, 20)).status, 'ATTRIBUTED');
  assert.equal(at([row('f', 10, 20)], occ(10, 21)).status, 'NO_CONTAINING_SYMBOL_VERSION');
  assert.equal(at([row('f', 10, 20)], occ(5, 2)).status, 'SPAN_INVALID');
});
