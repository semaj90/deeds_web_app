import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectEmbeddingRepresentationV1, listEmbeddingRepresentationsV1 } from './embedding-representation-v1.mjs';

const provenance = {
  representationRevision: 'repr-r1',
  modelRevision: 'embeddinggemma-r1',
  inputChecksum: 'sha256:input',
  outputChecksum: 'sha256:output',
};

test('permits canonical 768 and named derived representations only at declared dimensions', () => {
  for (const { representationId, dimensions } of listEmbeddingRepresentationsV1()) {
    assert.equal(inspectEmbeddingRepresentationV1({ ...provenance, representationId, dimensions }).accepted, true);
  }
  assert.equal(inspectEmbeddingRepresentationV1({ ...provenance, representationId: 'semantic_768', dimensions: 768 }).canonical, true);
});

test('rejects dimension 383, new 384 writes, unknown dimensions, and provenance gaps', () => {
  assert.ok(inspectEmbeddingRepresentationV1({ ...provenance, representationId: 'semantic_383', dimensions: 383 }).errors.includes('DIMENSION_383_FORBIDDEN'));
  assert.ok(inspectEmbeddingRepresentationV1({ ...provenance, representationId: 'legacy_384', dimensions: 384 }, { write: true }).errors.includes('DIMENSION_384_WRITE_FORBIDDEN'));
  assert.ok(inspectEmbeddingRepresentationV1({ ...provenance, representationId: 'semantic_768', dimensions: 383 }).errors.includes('REPRESENTATION_DIMENSION_MISMATCH'));
  assert.ok(inspectEmbeddingRepresentationV1({ representationId: 'semantic_768', dimensions: 768 }).errors.includes('MISSING_MODEL_REVISION'));
});
