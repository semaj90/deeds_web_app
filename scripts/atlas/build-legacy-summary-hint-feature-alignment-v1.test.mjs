import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacySummaryFeatureAlignmentV1 } from './lib/legacy-summary-feature-alignment-v1.mjs';

const candidate = (ordinal) => ({
  candidateOrdinal: ordinal,
  candidateSnapshotRevision: 'snapshot-1', ordinalMapChecksum: 'map-1',
  evidenceRefs: [`atlas_packet_chunk_lineage:row-${ordinal}`], canonicalId: `chunk-${ordinal}`,
  packetKey: `packet-${ordinal}`, sourceRef: `src/${ordinal}.ts`,
  sourceRevision: 'sha256:' + 'a'.repeat(64), workspaceRevision: 'sha256:' + 'b'.repeat(64),
});
const hint = (ordinal) => ({ hint: {
  candidateOrdinal: ordinal, candidateSnapshotRevision: 'snapshot-1', ordinalMapChecksum: 'map-1',
  chunkRowId: `row-${ordinal}`, canonicalChunkId: `chunk-${ordinal}`, packetKey: `packet-${ordinal}`,
  sourceRef: `src/${ordinal}.ts`, sourceRevision: 'sha256:' + 'a'.repeat(64),
  workspaceRevision: 'sha256:' + 'b'.repeat(64), trust: 'LEGACY_HINT_LINEAGE_BOUND',
  summaryDigest: 'sha256:' + 'c'.repeat(64), vectorIndexRow: ordinal + 10, vectorByteOffset: (ordinal + 10) * 768 * 4,
}, vectorDigest: 'sha256:' + 'd'.repeat(64) });

test('full candidate universe preserves unavailable mask and never invents cosine values', () => {
  const rows = buildLegacySummaryFeatureAlignmentV1({ candidates: Array.from({ length: 5 }, (_, i) => candidate(i)), alignedHints: new Map([[1, hint(1)], [3, hint(3)]]), qualityPolicyRevision: 'policy-1', ordinalMapChecksum: 'map-1' });
  assert.deepEqual(rows.map((row) => row.state), [
    'UNAVAILABLE', 'PENDING_QUERY_VECTOR', 'UNAVAILABLE', 'PENDING_QUERY_VECTOR', 'UNAVAILABLE',
  ]);
  assert.ok(rows.every((row) => row.rawCosine === null && row.score01 === null));
});

test('out-of-universe aligned ordinal cannot silently expand the cohort', () => {
  assert.throws(() => buildLegacySummaryFeatureAlignmentV1({ candidates: Array.from({ length: 3 }, (_, i) => candidate(i)), alignedHints: new Map([[5, hint(5)]]), qualityPolicyRevision: 'policy-1', ordinalMapChecksum: 'map-1' }), /ALIGNED_ORDINAL_OUT_OF_RANGE/);
});

test('identity drift is rejected rather than admitted by matching ordinal alone', () => {
  const bad = hint(1);
  bad.hint.sourceRevision = 'sha256:' + 'e'.repeat(64);
  assert.throws(() => buildLegacySummaryFeatureAlignmentV1({ candidates: [candidate(0), candidate(1)], alignedHints: new Map([[1, bad]]), qualityPolicyRevision: 'policy-1', ordinalMapChecksum: 'map-1' }), /ALIGNED_HINT_IDENTITY_INVALID/);
});

test('candidate without physical lineage reference fails closed', () => {
  assert.throws(() => buildLegacySummaryFeatureAlignmentV1({ candidates: [{ ...candidate(0), evidenceRefs: [] }], alignedHints: new Map(), qualityPolicyRevision: 'policy-1', ordinalMapChecksum: 'map-1' }), /CANDIDATE_CHUNK_LINEAGE_REF_MISSING/);
});
