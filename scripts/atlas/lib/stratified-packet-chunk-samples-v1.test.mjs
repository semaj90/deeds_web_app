import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStratifiedPacketChunkSamplesV1 } from './stratified-packet-chunk-samples-v1.mjs';

const row = (identity, classification, observedPhysicalChunkRowsByExactSourceRef = 0) => ({
  identity,
  repositoryId: 'repo:root',
  sourceRef: `${identity}.ts`,
  sourceRevision: 'sha256:source',
  workspaceRevision: 'sha256:workspace',
  classification,
  exactBindingRowCount: 1,
  bindingRevisionMatches: true,
  bindingDigestMatches: true,
  observedPhysicalChunkRowsByExactSourceRef,
  exactProvenLineageRows: 0,
  provenLineageRowsAtOtherRevisions: 0,
  physicalChunkMissingRows: 0,
  canonicalChunkIdMismatchRows: 0,
  packetUnresolvedRows: 0,
  packetIdentityConflictRows: 0,
  packetSourceMismatchRows: 0,
});

test('stratifies missing lineage by physical chunk presence and samples deterministically', () => {
  const input = [
    ...Array.from({ length: 12 }, (_, index) => row(`physical-${index}`, 'PROVEN_LINEAGE_MISSING', 2)),
    ...Array.from({ length: 4 }, (_, index) => row(`none-${index}`, 'PROVEN_LINEAGE_MISSING', 0)),
    row('stale', 'PROVEN_LINEAGE_REVISION_MISMATCH', 1),
    row('good', 'EXACT_CURRENT_PACKET_CHUNK_BRIDGE', 1),
  ];
  const options = { executionId: 'exec-1', workspaceRevision: 'sha256:workspace', limitPerStratum: 3 };
  const first = buildStratifiedPacketChunkSamplesV1(input, options);
  const replay = buildStratifiedPacketChunkSamplesV1(input.slice().reverse(), options);

  assert.deepEqual(first, replay);
  assert.deepEqual(first.populationCounts, {
    LINEAGE_MISSING_WITHOUT_PHYSICAL_CHUNKS: 4,
    LINEAGE_MISSING_WITH_PHYSICAL_CHUNKS: 12,
    LINEAGE_OTHER_REVISION: 1,
  });
  assert.equal(first.sampleCount, 7);
  assert.equal(first.samples.some((sample) => sample.identity === 'good'), false);
  assert.equal(first.samples.filter((sample) => sample.stratum === 'LINEAGE_MISSING_WITH_PHYSICAL_CHUNKS').length, 3);
});

test('rejects missing revision scope and unbounded limits', () => {
  assert.throws(() => buildStratifiedPacketChunkSamplesV1([], { executionId: 'exec' }), /REVISION_SCOPE_REQUIRED/);
  assert.throws(() => buildStratifiedPacketChunkSamplesV1([], {
    executionId: 'exec', workspaceRevision: 'rev', limitPerStratum: 101,
  }), /INVALID_PACKET_CHUNK_SAMPLE_LIMIT/);
});
