import test from 'node:test';
import assert from 'node:assert/strict';
import { alignLegacyHintToCandidateV1, buildLegacySummaryAlignmentV1 } from './legacy-summary-cei23-alignment-v1.mjs';

const hint = { chunkRowId: 'chunk-row-1', canonicalChunkId: 'canonical-chunk-1', packetKey: 'packet-1', sourceRef: 'src/a.ts', sourceRevision: 'src-r1', workspaceRevision: 'ws-r1', summaryDigest: 'sha256:a' };
const packetCandidate = { candidateOrdinal: 7, packetKey: 'packet-1', sourceRef: 'src/a.ts', sourceRevision: 'src-r1', workspaceRevision: 'ws-r1' };

test('fails closed when a packet-level CEI-23 candidate lacks chunk identity and summary digest', () => {
  assert.deepEqual(alignLegacyHintToCandidateV1(hint, [packetCandidate]), {
    status: 'CHUNK_IDENTITY_MISMATCH', candidateOrdinals: [7], reasons: ['CEI23_ORDINAL_ROW_HAS_NO_CHUNK_IDENTITY'],
  });
});

test('accepts only exact chunk, revision, workspace, and summary digest coordinates', () => {
  const candidate = { ...packetCandidate, chunkRowId: hint.chunkRowId, canonicalChunkId: hint.canonicalChunkId, summaryDigest: hint.summaryDigest };
  assert.equal(alignLegacyHintToCandidateV1(hint, [candidate]).status, 'EXACT_CURRENT_CANDIDATE_MATCH');
  assert.equal(alignLegacyHintToCandidateV1(hint, [{ ...candidate, sourceRevision: 'src-r2' }]).status, 'SOURCE_REVISION_MISMATCH');
  assert.equal(alignLegacyHintToCandidateV1(hint, [{ ...candidate, workspaceRevision: 'ws-r2' }]).status, 'WORKSPACE_REVISION_MISMATCH');
  assert.equal(alignLegacyHintToCandidateV1(hint, [{ ...candidate, summaryDigest: 'sha256:b' }]).status, 'SUMMARY_DIGEST_MISMATCH');
});

test('conserves all hint rows and rejects ambiguous identity joins', () => {
  const candidates = [packetCandidate, { ...packetCandidate, candidateOrdinal: 8 }];
  const result = buildLegacySummaryAlignmentV1([hint, { ...hint, chunkRowId: 'chunk-row-2' }], candidates);
  assert.equal(result.conserved, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.counts.DUPLICATE_OR_AMBIGUOUS_MATCH, 2);
});
