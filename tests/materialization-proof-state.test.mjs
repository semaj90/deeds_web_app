import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveMaterializationProofDetail,
  deriveMaterializationProofStates,
  materializationProofDetailSchema,
  materializationProofStateSchema,
} from '../scripts/atlas/lib/materialization-proof-state.mjs';

test('materialization proof helper distinguishes batching from publication', () => {
  const detail = deriveMaterializationProofDetail(
    {
      materializedRows: 1000,
      missingQdrantPointId: 495,
      missingQdrantCollection: 496,
      missingFeatureId: 0,
      missingCanonicalSourceRef: 0,
    },
    {
      fullMaterializationProven: false,
      resumeSemanticsProven: false,
      atomicPublicationProven: false,
      qdrantMirrorProven: false,
    },
  );

  assert.equal(materializationProofDetailSchema.parse(detail).batchingLogic, 'PROVEN');
  assert.equal(detail.fullMaterialization, 'NOT_YET_PROVEN');
  assert.equal(detail.resumeSemantics, 'RESUME_SEMANTICS_NOT_YET_PROVEN');
  assert.equal(detail.atomicPublication, 'ATOMIC_PUBLICATION_NOT_YET_PROVEN');
  assert.equal(detail.identityCoverage, 'STILL_PARTIAL');

  const states = deriveMaterializationProofStates(detail);
  assert.deepEqual(states, [
    'BATCHING_LOGIC_PROVEN',
    'FULL_MATERIALIZATION_NOT_YET_PROVEN',
    'RESUME_SEMANTICS_NOT_YET_PROVEN',
    'ATOMIC_PUBLICATION_NOT_YET_PROVEN',
    'QDRANT_MIRROR_NOT_YET_PROVEN',
    'IDENTITY_COVERAGE_STILL_PARTIAL',
  ]);
  assert.equal(materializationProofStateSchema.parse(states[0]), 'BATCHING_LOGIC_PROVEN');
});

test('materialization proof helper keeps qdrant mirror proof explicit when requested', () => {
  const detail = deriveMaterializationProofDetail(
    {
      materializedRows: 10,
      missingQdrantPointId: 0,
      missingQdrantCollection: 0,
      missingFeatureId: 0,
      missingCanonicalSourceRef: 0,
    },
    {
      fullMaterializationProven: true,
      resumeSemanticsProven: true,
      atomicPublicationProven: true,
      qdrantMirrorProven: true,
    },
  );

  assert.equal(detail.qdrantMirror, 'PROVEN');
  assert.equal(detail.identityCoverage, 'COMPLETE');
  assert.deepEqual(deriveMaterializationProofStates(detail), [
    'BATCHING_LOGIC_PROVEN',
    'FULL_MATERIALIZATION_PROVEN',
    'RESUME_SEMANTICS_PROVEN',
    'ATOMIC_PUBLICATION_PROVEN',
    'QDRANT_MIRROR_PROVEN',
    'IDENTITY_COVERAGE_COMPLETE',
  ]);
});
