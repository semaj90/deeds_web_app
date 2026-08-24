import assert from 'node:assert/strict';
import test from 'node:test';
import { ATLAS_OPERATIONS, createAtlasOperationRequestV1 } from '../dist/index.js';
import { SOM_NEURON_COUNT, buildRectangularSomEdges, somCoordinates, somNeuronOrdinal, topologyFeature4 } from '../dist/index.js';

test('exports the frozen operation vocabulary', () => {
  assert.deepEqual(ATLAS_OPERATIONS.slice(0, 3), ['AST_CHUNK', 'LEXICAL_SEARCH', 'SEMANTIC_SEARCH']);
  assert.ok(ATLAS_OPERATIONS.includes('PATCH_VALIDATE'));
});

test('creates a revision-aware operation request', () => {
  const request = createAtlasOperationRequestV1({
    requestId: 'req-test-1',
    operation: 'AST_CHUNK',
    revisions: { sourceRevision: 'sha256:test' },
    payload: { sourceRef: 'src/example.ts' },
  });
  assert.equal(request.schema, 'atlas.operation.v1');
  assert.equal(request.operation, 'AST_CHUNK');
  assert.equal(request.revisions.sourceRevision, 'sha256:test');
});

test('keeps SOM coordinates separate from candidate ordinals', () => {
  assert.equal(SOM_NEURON_COUNT, 400);
  assert.equal(somNeuronOrdinal(7, 13), 153);
  assert.deepEqual(somCoordinates(153), [7, 13]);
  assert.equal(buildRectangularSomEdges().length, 760);
  assert.deepEqual(topologyFeature4([0.1, 0.2, 0.3, 0.4]), [0.1, 0.2, 0.3, 0.4]);
  assert.throws(() => topologyFeature4([1, 2, 3]), /FEATURE4_INVALID/);
});
