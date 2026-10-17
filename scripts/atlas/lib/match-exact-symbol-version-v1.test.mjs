import assert from 'node:assert/strict';
import test from 'node:test';
import { matchExactSymbolVersionV1 } from './match-exact-symbol-version-v1.mjs';

const row = {
  packet_key: 'packet:a', source_ref: 'src/a.ts', source_revision: 'sha256:a',
  workspace_revision: 'sha256:w', symbol_name: 'alpha', start_byte: 10, end_byte: 20,
};
const symbol = {
  packet_key: 'packet:a', source_ref: 'src/a.ts', source_revision: 'sha256:a',
  workspace_revision: 'sha256:w', qualified_name: 'alpha', byte_start: '10', byte_end: '20',
  stable_symbol_id: 'stable:a', symbol_version_id: 'version:a',
};

test('resolves a symbol only when complete identity, name, and byte span match', () => {
  assert.deepEqual(matchExactSymbolVersionV1(row, [symbol]), {
    status: 'EXACT_SYMBOL_VERSION_MATCH', canonicalSymbolId: 'stable:a', symbolVersionId: 'version:a',
  });
});

test('does not promote a same-name symbol with a different byte span', () => {
  assert.deepEqual(matchExactSymbolVersionV1(row, [{ ...symbol, byte_start: '9' }]), {
    status: 'NAME_MATCH_SPAN_MISMATCH', canonicalSymbolId: null, symbolVersionId: null,
  });
});

test('does not resolve a symbol from another packet or revision', () => {
  assert.equal(matchExactSymbolVersionV1(row, [{ ...symbol, packet_key: 'packet:b' }]).status, 'NO_EXACT_SYMBOL_MATCH');
  assert.equal(matchExactSymbolVersionV1(row, [{ ...symbol, source_revision: 'sha256:other' }]).status, 'NO_EXACT_SYMBOL_MATCH');
});

test('rejects duplicate exact symbol rows as ambiguous', () => {
  assert.deepEqual(matchExactSymbolVersionV1(row, [symbol, { ...symbol, symbol_version_id: 'version:b' }]), {
    status: 'AMBIGUOUS_EXACT_SYMBOL_MATCH', canonicalSymbolId: null, symbolVersionId: null,
  });
});
