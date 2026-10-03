import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectJsonSourceShapeV1, JSON_SOURCE_SHAPE_POLICY_V1 } from './json-source-shape-policy-v1.mjs';

test('counts bounded object keys while treating arrays as opaque values', () => {
  const result = inspectJsonSourceShapeV1(
    '{"domain":"retrieval","items":[{"id":1},{"id":2}],"registry":{"operation":"search","nested":{"owner":"atlas"}}}',
    'authored.json',
  );
  assert.equal(result.potentialObservations, 6);
  assert.equal(result.outcome, 'COMPLETE');
  assert.equal(result.rootKind, 'object');
});

test('valid root arrays and scalars are valid zero-observation inputs', () => {
  for (const text of ['null', '42', '[{"id":1}]']) {
    const result = inspectJsonSourceShapeV1(text, 'root.json');
    assert.equal(result.potentialObservations, 0);
    assert.equal(result.outcome, 'VALID_ZERO_OBSERVATIONS');
  }
});

test('enforces UTF-8 byte and observation ceilings without partial counts', () => {
  assert.throws(() => inspectJsonSourceShapeV1('{"é":1}', 'multibyte.json', { maxSourceBytes: 6 }),
    /STRUCTURAL_RESOURCE_LIMIT_DEFERRED:SOURCE_BYTES_EXCEED_LIMIT/);
  const wide = JSON.stringify(Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`k${i}`, i])));
  assert.throws(() => inspectJsonSourceShapeV1(wide, 'wide.json', { maxObservations: 2 }),
    /STRUCTURAL_RESOURCE_LIMIT_DEFERRED:OBSERVATIONS_EXCEED_LIMIT/);
  assert.throws(() => inspectJsonSourceShapeV1('{}', 'oversized-policy.json', {
    maxObservations: JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile + 1,
  }), /JSON_SOURCE_OBSERVATION_LIMIT_INVALID/);
});
