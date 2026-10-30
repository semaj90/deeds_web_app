import assert from 'node:assert/strict';
import test from 'node:test';
import { auditModelArtifactBindingsV1, auditQdrantProjectionRowsV1, isPinnedModelRevisionV1 } from './qdrant-projection-admission-v1.mjs';

const completeRow = {
  id: 'chunk-row-1',
  qdrant_id: 'point-1',
  packet_key: 'packet:1',
  source_ref: 'src/a.ts',
  chunk_id: 'chunk:1',
  content_hash: 'sha256:abc',
  source_revision: 'sha256:def',
  workspace_revision: 'git:123',
  embedding_model: 'embeddinggemma',
  embedding_version: 'embeddinggemma-r1',
  model_artifact_revision: `sha256:${'a'.repeat(64)}`,
};

test('admits a uniquely identified row with complete source and model lineage', () => {
  assert.deepEqual(auditQdrantProjectionRowsV1([completeRow]), [{
    admitted: true,
    rowId: 'chunk-row-1',
    qdrantId: 'point-1',
    missingFields: [],
  }]);
});

test('rejects missing source, representation, and model lineage', () => {
  const incomplete = { ...completeRow, source_revision: null, workspace_revision: '', embedding_version: undefined };
  assert.deepEqual(auditQdrantProjectionRowsV1([incomplete])[0].missingFields, [
    'source_revision',
    'workspace_revision',
    'embedding_version',
  ]);
});

test('rejects duplicate Qdrant projection IDs within a batch', () => {
  const rows = [completeRow, { ...completeRow, id: 'chunk-row-2' }];
  assert.deepEqual(auditQdrantProjectionRowsV1(rows).map((row) => row.missingFields), [
    ['unique_qdrant_id'],
    ['unique_qdrant_id'],
  ]);
});

test('rejects mutable model tags as pinned model revisions', () => {
  assert.equal(isPinnedModelRevisionV1('embeddinggemma:latest'), false);
  assert.equal(isPinnedModelRevisionV1(`embeddinggemma@sha256:${'a'.repeat(64)}`), true);
  assert.equal(isPinnedModelRevisionV1('b'.repeat(64)), true);
  assert.equal(isPinnedModelRevisionV1(`sha256:${'b'.repeat(64)}`), true);
  assert.equal(isPinnedModelRevisionV1('embeddinggemma@sha256:abc123'), false);
  assert.equal(isPinnedModelRevisionV1(`embeddinggemma@sha256:${'g'.repeat(64)}`), false);
});

test('requires each canonical row artifact digest to match the projected model receipt', () => {
  const expected = `sha256:${'a'.repeat(64)}`;
  assert.deepEqual(auditModelArtifactBindingsV1([completeRow], expected), [
    { rowIndex: 0, admitted: true, reason: null },
  ]);
  assert.equal(auditModelArtifactBindingsV1([
    { ...completeRow, model_artifact_revision: `sha256:${'b'.repeat(64)}` },
  ], expected)[0].reason, 'MODEL_ARTIFACT_REVISION_MISMATCH');
  assert.equal(auditModelArtifactBindingsV1([
    { ...completeRow, model_artifact_revision: null },
  ], expected)[0].reason, 'ROW_MODEL_ARTIFACT_REVISION_INVALID');
});
