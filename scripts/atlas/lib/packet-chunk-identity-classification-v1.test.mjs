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
  assert.equal(result.reasonCode, 'PROVEN_LINEAGE_SOURCE_REVISION_MISMATCH');
});

test('explains missing lineage by absent source binding, key mismatch, or missing chunk row', () => {
  const packet = { packet_key: 'p1', source_revision: base.source_revision, lineage_binding_checksum: 'h', lineage_producer_revision: 'r' };
  assert.equal(classifyPacketChunkIdentityV1({ ...base, packet_rows: [packet] }).reasonCode, 'NO_PACKET_LINEAGE_ROWS');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    lineage_rows: [{ packet_key: 'other', source_revision: base.source_revision, chunk_row_exists: true }],
  }).reasonCode, 'PROVEN_LINEAGE_PACKET_KEY_MISMATCH');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    lineage_rows: [{ packet_key: 'p1', source_revision: base.source_revision, chunk_row_exists: false }],
  }).reasonCode, 'MATCHING_LINEAGE_CHUNK_ROW_MISSING');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    packet_lineage_rows: [{ packet_key: 'p1', lineage_source_ref: base.source_ref, source_revision: null, revision_status: 'UNPROVEN', chunk_row_exists: true }],
  }).reasonCode, 'PACKET_LINEAGE_PRESENT_UNPROVEN');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    packet_lineage_rows: [{ packet_key: 'p1', lineage_source_ref: 'src/renamed.ts', source_revision: base.source_revision, revision_status: 'PROVEN', chunk_row_exists: true }],
  }).reasonCode, 'PACKET_LINEAGE_SOURCE_REF_MISMATCH');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    packet_lineage_rows: [],
  }).reasonCode, 'NO_PACKET_LINEAGE_ROWS');
});

test('explains packet identity failures without promoting legacy digests', () => {
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [{ packet_key: 'p1', source_revision: 'sha256:old' }],
  }).reasonCode, 'PACKET_SOURCE_REVISION_MISMATCH');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [{ packet_key: 'p1', source_revision: base.source_revision }],
  }).reasonCode, 'PACKET_LINEAGE_PROVENANCE_MISSING');
  const legacy = classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [{ packet_key: 'p1', legacy_sha256: base.content_digest }],
  });
  assert.equal(legacy.category, 'LEGACY_HASH_ONLY_DIAGNOSTIC');
  assert.equal(legacy.reasonCode, 'LEGACY_DIGEST_MATCH_WITHOUT_QUALIFIED_PACKET_IDENTITY');
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

test('source-ref chunk presence remains a diagnostic separate from packet lineage qualification', () => {
  const packet = { packet_key: 'p1', source_revision: base.source_revision, lineage_binding_checksum: 'h', lineage_producer_revision: 'r' };
  const classification = classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    packet_lineage_rows: [],
    source_chunk_diagnostic: {
      exactSourceRefChunkCount: 2,
      revisionQualified: false,
      reason: 'CODEBASE_CHUNK_INDEX_SOURCE_REVISION_COLUMN_UNAVAILABLE',
    },
  });
  assert.equal(classification.category, 'CANONICAL_PACKET_IDENTITY_ONLY');
  assert.equal(classification.sourceRefChunkDiagnostic, 'SOURCE_REF_CHUNKS_PRESENT_REVISION_UNQUALIFIED');
  assert.equal(classifyPacketChunkIdentityV1({
    ...base,
    packet_rows: [packet],
    source_chunk_diagnostic: {
      exactSourceRefChunkCount: 1,
      revisionQualified: false,
    },
  }).sourceRefChunkDiagnostic, 'SOURCE_REF_CHUNKS_PRESENT_REVISION_UNQUALIFIED');
});
