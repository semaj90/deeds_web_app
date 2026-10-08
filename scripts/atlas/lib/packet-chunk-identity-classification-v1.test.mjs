import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPacketChunkIdentityV1,
  summarizePacketChunkIdentityClassificationsV1,
} from './packet-chunk-identity-classification-v1.mjs';

const base = {
  source_ref: 'src/example.ts',
  source_revision: 'sha256:source-v1',
  content_digest: 'sha256:content-v1',
  packet_rows: [],
  lineage_rows: [],
};

test('classifies the six primary packet/chunk identity outcomes', () => {
  const cases = [
    [base, 'NO_PACKET_REFERENCE'],
    [{ ...base, packet_rows: [{ packet_key: 'p1' }] }, 'PACKET_PRESENT_NO_CHUNK_BINDING'],
    [{ ...base, packet_rows: [{ packet_key: 'p1', source_revision: base.source_revision, lineage_binding_checksum: 'h', lineage_producer_revision: 'r' }] }, 'CANONICAL_PACKET_IDENTITY_ONLY'],
    [{ ...base,
      packet_rows: [{ packet_key: 'p1', source_revision: base.source_revision, lineage_binding_checksum: 'h', lineage_producer_revision: 'r' }],
      lineage_rows: [{ packet_key: 'p1', source_revision: base.source_revision, chunk_row_exists: true }],
    }, 'EXACT_LINEAGE'],
    [{ ...base, packet_rows: [{ packet_key: 'p1' }, { packet_key: 'p2' }] }, 'AMBIGUOUS_MULTI_MATCH'],
    [{ ...base, packet_rows: [{ packet_key: 'p1', legacy_sha256: base.content_digest }] }, 'LEGACY_HASH_ONLY_DIAGNOSTIC'],
  ];

  for (const [row, expected] of cases) {
    assert.equal(classifyPacketChunkIdentityV1(row).category, expected);
  }
});

test('does not let legacy hash or source revision alone establish canonical identity', () => {
  const legacyOnly = classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [{ packet_key: 'p1', source_revision: base.source_revision, legacy_sha256: base.content_digest }],
  });
  assert.equal(legacyOnly.category, 'LEGACY_HASH_ONLY_DIAGNOSTIC');

  const revisionOnly = classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [{ packet_key: 'p1', source_revision: base.source_revision }],
  });
  assert.equal(revisionOnly.category, 'PACKET_PRESENT_NO_CHUNK_BINDING');
});

test('requires exact packet and source-revision match for lineage classification', () => {
  const packet = { packet_key: 'p1', source_revision: base.source_revision, lineage_binding_checksum: 'h', lineage_producer_revision: 'r' };
  const result = classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    lineage_rows: [{ packet_key: 'p1', source_revision: 'sha256:other', chunk_row_exists: true }],
  });
  assert.equal(result.category, 'CANONICAL_PACKET_IDENTITY_ONLY');
});

test('classification summary is exhaustive and rejects unknown categories', () => {
  const summary = summarizePacketChunkIdentityClassificationsV1([
    { category: 'EXACT_LINEAGE' },
    { category: 'NO_PACKET_REFERENCE' },
  ]);
  assert.equal(summary.rowCount, 2);
  assert.equal(summary.classifiedRowCount, 2);
  assert.equal(summary.counts.EXACT_LINEAGE, 1);
  assert.throws(() => summarizePacketChunkIdentityClassificationsV1([{ category: 'UNKNOWN' }]), /CATEGORY_UNKNOWN/);
});
