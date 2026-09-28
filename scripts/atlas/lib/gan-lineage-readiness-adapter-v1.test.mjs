import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adaptGanLineageReadinessV1 } from './gan-lineage-readiness-adapter-v1.mjs';

function v3(overrides = {}) {
  const receipt = {
    schema: 'atlas.mapreduce-chunk-readiness-receipt.v3',
    status: 'READINESS_REPLAY_COMPLETE',
    candidateCount: 127,
    chunkCount: 1520,
    currentSemanticOwner: {
      table: 'codebase_chunk_index',
      column: 'content_embedding_768',
      storageType: 'vector(768)',
    },
    measured: {
      packetStates: { PACKET_REVISION_QUALIFIED: 1520 },
      chunkStates: { CHUNK_REVISION_QUALIFIED: 1520 },
      semantic768PhysicalStates: { MISSING: 1520 },
      semantic768QualityStates: { MISSING: 1520 },
      semanticRepresentationBindingStates: { UNQUALIFIED_OR_INCOMPLETE: 1520 },
      summaryStates: { MISSING: 1520 },
      summarySemanticStates: { MISSING: 1338, UNBOUND: 182 },
      exactSourceFileDigestRows: 1520,
      currentSourceBytesMatchRows: 1520,
      currentSourceFilesRehashed: 127,
    },
    writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
    canonicalAuthority: false,
    receiptChecksum: null,
    ...overrides,
  };
  receipt.receiptChecksum = `sha256:${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  return receipt;
}

test('accepts a complete v3 exact-lineage receipt while preserving missing semantic state', () => {
  const adapted = adaptGanLineageReadinessV1(v3());
  assert.equal(adapted?.receiptVersion, 'v3');
  assert.equal(adapted?.chunkCount, 1520);
  assert.deepEqual(adapted?.chunkStates, { CHUNK_REVISION_QUALIFIED: 1520 });
  assert.deepEqual(adapted?.semantic768, { MISSING: 1520 });
  assert.deepEqual(adapted?.semanticRepresentationBinding, { UNQUALIFIED_OR_INCOMPLETE: 1520 });
});

test('rejects a v3 receipt with a different semantic storage owner', () => {
  const receipt = v3({ currentSemanticOwner: { table: 'codebase_chunk_index', column: 'content_embedding', storageType: 'halfvec(768)' } });
  assert.equal(adaptGanLineageReadinessV1(receipt), null);
});

test('rejects incomplete source-byte or chunk counts', () => {
  const receipt = v3();
  receipt.measured.currentSourceBytesMatchRows = 1519;
  assert.equal(adaptGanLineageReadinessV1(receipt), null);
});

test('rejects any receipt reporting datastore or projection writes', () => {
  const receipt = v3();
  receipt.writes.valkey = 1;
  assert.equal(adaptGanLineageReadinessV1(receipt), null);
});

test('rejects a V3 receipt whose internal checksum was not recomputed after tampering', () => {
  const receipt = v3();
  receipt.measured.semantic768PhysicalStates.MISSING = 0;
  assert.equal(adaptGanLineageReadinessV1(receipt), null);
});

test('retains compatibility with the existing v2 read-only receipt contract', () => {
  const receipt = {
    schema: 'atlas.mapreduce-chunk-readiness-receipt.v2',
    candidateCount: 2,
    chunkCount: 4,
    measured: { inputConserved: true, chunkStates: { CHUNK_REVISION_QUALIFIED: 4 }, packetStates: { PACKET_REVISION_QUALIFIED: 4 } },
    writes: { postgres: 0 },
    canonicalAuthority: false,
  };
  assert.equal(adaptGanLineageReadinessV1(receipt)?.receiptVersion, 'v2');
});
