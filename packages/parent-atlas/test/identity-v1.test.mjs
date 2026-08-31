import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStructuralOccurrenceKeyV1,
  deriveSymbolVersionIdV1,
  identityDerivationMetadataV1,
} from '../dist/core/identity-v1.js';

const occurrence = {
  sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:source-1',
  parserRevision: 'tree-sitter-typescript:v1',
  upstreamNodeId: 'node-1',
  upstreamChunkId: 'chunk-1',
  byteStart: 4,
  byteEnd: 18,
};

test('structural occurrence derivation is revision-qualified and deterministic', () => {
  const first = deriveStructuralOccurrenceKeyV1(occurrence);
  const second = deriveStructuralOccurrenceKeyV1({ ...occurrence });
  assert.equal(first, second);
  assert.match(first, /^occurrence:[a-f0-9]{64}$/);
  assert.notEqual(first, deriveStructuralOccurrenceKeyV1({ ...occurrence, sourceRevision: 'sha256:source-2' }));
  assert.notEqual(first, deriveStructuralOccurrenceKeyV1({ ...occurrence, byteEnd: 19 }));
});

test('invalid occurrence coordinates fail closed', () => {
  assert.throws(() => deriveStructuralOccurrenceKeyV1({ ...occurrence, byteEnd: 3 }), /byteEnd must be >= byteStart/);
});

test('symbol-version derivation preserves the current compatibility formula', () => {
  const input = {
    stableSymbolId: 'symbol:foo',
    sourceRevision: 'sha256:source-1',
    declarationHash: 'sha256:decl-1',
    upstreamNodeId: 'node-1',
  };
  const actual = deriveSymbolVersionIdV1(input);
  assert.match(actual, /^symbol-version:[a-f0-9]{64}$/);
  assert.equal(actual, deriveSymbolVersionIdV1(input));
  assert.notEqual(actual, deriveSymbolVersionIdV1({ ...input, declarationHash: 'sha256:decl-2' }));
  assert.equal(identityDerivationMetadataV1().canonicalChunkId, 'NOT_DEFINED_UNTIL_CHUNK_OWNER_AUDIT');
});
