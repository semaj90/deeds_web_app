import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildLineageQualifiedQdrantPointV1 } from './apply-lineage-qualified-semantic-768-backfill-v1.mjs';

const digest = (character) => character.repeat(64);
const fixture = () => ({
  candidate: {
    canonicalId: 'chunk:canonical-1',
    packetKey: 'packet:1',
    sourceRef: 'src/example.ts#L1-L8',
    sourceRevision: `sha256:${digest('a')}`,
    workspaceRevision: `sha256:${digest('b')}`,
    evidenceRefs: [`chunk:${digest('c')}`],
  },
  row: {
    id: '00000000-0000-4000-8000-000000000001',
    source_ref: 'src/example.ts#L1-L8',
    content_hash: digest('c'),
  },
  vector: Array(768).fill(0.125),
  model: 'embeddinggemma:pinned-test',
  candidateSnapshotRevision: `snapshot:${digest('d')}`,
  ordinalMapChecksum: digest('e'),
});

test('lineage-qualified Qdrant point binds canonical identity and exact revisions', () => {
  const point = buildLineageQualifiedQdrantPointV1(fixture());
  assert.equal(point.payload.canonical_id, 'chunk:canonical-1');
  assert.equal(point.payload.packet_key, 'packet:1');
  assert.equal(point.payload.source_ref, 'src/example.ts#L1-L8');
  assert.equal(point.payload.source_revision, `sha256:${digest('a')}`);
  assert.equal(point.payload.workspace_revision, `sha256:${digest('b')}`);
  const expectedProjectionRevision = createHash('sha256')
    .update(`${fixture().candidateSnapshotRevision}\0${fixture().ordinalMapChecksum}`)
    .digest('hex');
  assert.equal(point.payload.projection_revision, `candidate-map:${expectedProjectionRevision}`);
  assert.equal(point.vector.content.length, 768);
});

test('lineage-qualified Qdrant point fails closed without canonical identity', () => {
  const input = fixture();
  input.candidate.canonicalId = undefined;
  assert.throws(() => buildLineageQualifiedQdrantPointV1(input), /QDRANT_PROJECTION_IDENTITY_REQUIRED:canonicalId/);
});

test('lineage-qualified Qdrant point rejects source or chunk digest disagreement', () => {
  const sourceMismatch = fixture();
  sourceMismatch.row.source_ref = 'src/other.ts';
  assert.throws(() => buildLineageQualifiedQdrantPointV1(sourceMismatch), /QDRANT_PROJECTION_SOURCE_REF_MISMATCH/);

  const digestMismatch = fixture();
  digestMismatch.row.content_hash = digest('f');
  assert.throws(() => buildLineageQualifiedQdrantPointV1(digestMismatch), /QDRANT_PROJECTION_CONTENT_HASH_MISMATCH/);
});
