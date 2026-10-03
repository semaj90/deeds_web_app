import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySemanticBindingV3, inspectSemanticVectorV3, parsePgVectorTextV3 } from './mapreduce-readiness-v3-utils.mjs';

test('parses PostgreSQL vector text without treating null as a vector', () => {
  assert.deepEqual(parsePgVectorTextV3('[1, -0, 3.5]'), [1, -0, 3.5]);
  assert.equal(parsePgVectorTextV3(null), null);
  assert.equal(parsePgVectorTextV3('not-a-vector'), null);
});

test('classifies vector presence, shape, finiteness, and norm independently', () => {
  assert.equal(inspectSemanticVectorV3(null).state, 'MISSING');
  assert.equal(inspectSemanticVectorV3('broken').state, 'UNREADABLE');
  assert.equal(inspectSemanticVectorV3('[1,2]').state, 'WRONG_DIMENSION');
  assert.equal(inspectSemanticVectorV3(`[${Array(767).fill('0').concat('NaN').join(',')}]`).state, 'NON_FINITE');
  assert.equal(inspectSemanticVectorV3(`[${Array(768).fill('0').join(',')}]`).state, 'ZERO_NORM');
  assert.equal(inspectSemanticVectorV3(`[${Array(768).fill('0').fill('2', 0, 1).join(',')}]`).state, 'NON_UNIT');
  const vector = `[${Array(768).fill('0').fill('1', 0, 1).join(',')}]`;
  assert.equal(inspectSemanticVectorV3(vector).state, 'WELL_FORMED');
  assert.match(inspectSemanticVectorV3(vector).textChecksum, /^sha256:[a-f0-9]{64}$/);
});

test('does not confuse a representation label with complete immutable input/output digests', () => {
  const complete = {
    representationRevision: 'semantic_768:policy-v2',
    modelRevision: `sha256:${'a'.repeat(64)}`,
    tokenizerRevision: `sha256:${'b'.repeat(64)}`,
    inputDigest: `sha256:${'c'.repeat(64)}`,
    vectorChecksum: `sha256:${'d'.repeat(64)}`,
  };
  assert.equal(classifySemanticBindingV3(complete), 'DIGEST_BOUND');
  assert.equal(classifySemanticBindingV3({ ...complete, tokenizerRevision: 'configured-only' }), 'UNQUALIFIED_OR_INCOMPLETE');
  assert.equal(classifySemanticBindingV3({ ...complete, representationRevision: '' }), 'UNQUALIFIED_OR_INCOMPLETE');
});
