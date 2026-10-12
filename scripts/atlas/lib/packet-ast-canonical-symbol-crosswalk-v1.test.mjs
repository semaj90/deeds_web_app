import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPacketAstObservationsToCanonicalSymbolsV1 } from './packet-ast-canonical-symbol-crosswalk-v1.mjs';

const binding = {
  packetKey: 'packet:fixture',
  sourceRef: 'src/fixture.ts',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
};

function fixture() {
  const observations = [{ observation: {
    observation_id: 'ast:1',
    source_ref: binding.sourceRef,
    source_revision: binding.sourceRevision,
    canonical_authority: false,
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
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    ...binding,
    workspaceRevision: `sha256:${'c'.repeat(64)}`,
  });
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

test('rejects placeholder revisions instead of treating them as revision-qualified', () => {
  const input = fixture();
  assert.throws(() => matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    ...binding,
    sourceRevision: 'sha256:source',
  }), /CROSSWALK_INPUT_REQUIRED/);
});

test('marks stale, authority-claiming, malformed, and duplicate AST observations invalid', () => {
  const input = fixture();
  const observation = input.observations[0].observation;
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...binding,
    symbols: input.symbols,
    observations: [
      { observation: { ...observation, source_revision: `sha256:${'c'.repeat(64)}` } },
      { observation: { ...observation, canonical_authority: true } },
      { observation: { ...observation, byte_start: 4.5 } },
      { observation },
      { observation },
      null,
    ],
  });
  assert.equal(result.invalid.length, 5);
  assert.equal(result.matches.length, 1);
  assert.equal(result.exactOneToOne, false);
});

test('does not call a partial observation set an exact one-to-one crosswalk', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    symbols: [...input.symbols, { ...input.symbols[0], symbolVersionId: 'symbol-version:2', byteStart: 30, byteEnd: 40 }],
    ...binding,
  });
  assert.equal(result.allStoredVersionsMatched, false);
  assert.equal(result.exactCanonicalSymbolCoverage, false);
  assert.equal(result.exactOneToOne, false);
});

test('separates complete canonical symbol coverage from extra unmatched AST observations', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    observations: [
      ...input.observations,
      { observation: {
        ...input.observations[0].observation,
        observation_id: 'ast:unrepresented-local-variable',
        captures: { name: 'localValue', syntax_kind: 'variable_declarator' },
        byte_start: 24,
        byte_end: 34,
      } },
    ],
    ...binding,
  });
  assert.equal(result.allStoredVersionsMatched, true);
  assert.equal(result.exactCanonicalSymbolCoverage, true);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.exactOneToOne, false);
});

test('rejects malformed canonical symbol identities and byte offsets', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    symbols: [
      { ...input.symbols[0], symbolVersionId: '' },
      { ...input.symbols[0], symbolVersionId: 'symbol-version:2', byteStart: '4.5' },
    ],
    ...binding,
  });
  assert.equal(result.invalidSymbols.length, 2);
  assert.equal(result.matches.length, 0);
  assert.equal(result.allStoredVersionsMatched, false);
  assert.equal(result.exactOneToOne, false);
});

test('rejects canonical symbol rows from outside the requested revision scope', () => {
  const input = fixture();
  const result = matchPacketAstObservationsToCanonicalSymbolsV1({
    ...input,
    symbols: [{ ...input.symbols[0], sourceRevision: `sha256:${'c'.repeat(64)}` }],
    ...binding,
  });
  assert.equal(result.invalidSymbols.length, 1);
  assert.equal(result.matches.length, 0);
  assert.equal(result.exactOneToOne, false);
});
