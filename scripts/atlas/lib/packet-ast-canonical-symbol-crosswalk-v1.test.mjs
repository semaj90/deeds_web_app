import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPacketAstObservationsToCanonicalSymbolsV1 } from './packet-ast-canonical-symbol-crosswalk-v1.mjs';

const binding = {
  packetKey: 'packet:fixture',
  sourceRef: 'src/fixture.ts',
  sourceRevision: 'sha256:source',
  workspaceRevision: 'sha256:workspace',
};

function fixture() {
  const observations = [{ observation: {
    observation_id: 'ast:1',
    byte_start: 4,
    byte_end: 22,
    captures: { name: 'lookup', syntax_kind: 'function_declaration' },
  } }];
  const symbols = [{
    ...binding,
    registryStatus: 'active',
    byteStart: '4',
    byteEnd: '22',
    qualifiedName: 'export_statement::function_declaration::lookup',
    symbolVersionId: 'symbol-version:1',
    stableSymbolId: 'stable-symbol:1',
  }];
  return { observations, symbols };
}

test('matches one revision-bound AST declaration to its active canonical symbol version', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({ ...input, ...binding });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].symbolVersionId, 'symbol-version:1');
  assert.equal(result.allStoredVersionsMatched, true);
  assert.equal(result.exactOneToOne, true);
});

test('does not match stale source or workspace revisions', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({ ...input, ...binding, workspaceRevision: 'sha256:other' });
  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('rejects ambiguous and inactive canonical candidates', () => {
  const input = fixture();
  const ambiguous = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    symbols: [...input.symbols, { ...input.symbols[0], symbolVersionId: 'symbol-version:2' }],
    ...binding,
  });
  assert.equal(ambiguous.ambiguous.length, 1);
  const inactive = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    symbols: [{ ...input.symbols[0], registryStatus: 'inactive' }],
    ...binding,
  });
  assert.equal(inactive.matches.length, 0);
});
