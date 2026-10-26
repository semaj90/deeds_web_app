import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCHEMA_PROPOSAL_V1,
  evaluatePacketDigestBridgeRow,
  normalizeSourceRef,
} from './prove-packet-digest-bridge-proposal-v1.mjs';

const sampleInput = () => ({
  workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
  executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
  sourceRef: 'crates/atlas_packet_parser/index.js',
  sourceRevision: 'sha256:5bb2826a27ba9434029c48b27ccf75dd1b08857d6b9ab110a14f0833cabc4769',
  sourceContentDigest: '5bb2826a27ba9434029c48b27ccf75dd1b08857d6b9ab110a14f0833cabc4769',
  packetKey: 'packet:0ef4e5eff91e',
  packetContentDigest: '5bb2826a27ba9434029c48b27ccf75dd1b08857d6b9ab110a14f0833cabc4769',
  packetSourceRevision: 'sha256:5bb2826a27ba9434029c48b27ccf75dd1b08857d6b9ab110a14f0833cabc4769',
  packetWorkspaceRevisionKey: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
  hasAmbiguousPackets: false,
  chunkContentDigests: ['d39bf05457f072341fca8b3f368df0695f064ded259a02612e6a96f2ef9d88de'],
  sourceAuthorityReceiptRef: 'docs/reports/selected-graphify-execution-owner-v1.json',
  packetLineageReceiptRef: 'docs/reports/packet-writer-lineage-v1.json',
});

test('proposal conforms to schema and EXACT_MATCH status', () => {
  const proposal = evaluatePacketDigestBridgeRow(sampleInput());
  assert.equal(proposal.schema, SCHEMA_PROPOSAL_V1);
  assert.equal(proposal.status, 'EXACT_MATCH');
  assert.equal(proposal.admissionAuthorized, false, 'admissionAuthorized MUST always be false');
  assert.equal(proposal.sourceRef, 'crates/atlas_packet_parser/index.js');
  assert.equal(proposal.packetKey, 'packet:0ef4e5eff91e');
  assert.equal(proposal.chunkContentDigests.length, 1);
  assert.notEqual(proposal.chunkContentDigests[0], proposal.sourceContentDigest, 'chunk digest and source digest are distinct');
});

test('missing packet key produces MISSING_BINDING', () => {
  const input = sampleInput();
  delete input.packetKey;
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.equal(proposal.status, 'MISSING_BINDING');
  assert.equal(proposal.admissionAuthorized, false);
});

test('ambiguous packet keys produce AMBIGUOUS', () => {
  const input = sampleInput();
  input.hasAmbiguousPackets = true;
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.equal(proposal.status, 'AMBIGUOUS');
  assert.equal(proposal.admissionAuthorized, false);
});

test('packet source revision mismatch produces REVISION_MISMATCH', () => {
  const input = sampleInput();
  input.packetSourceRevision = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.equal(proposal.status, 'REVISION_MISMATCH');
  assert.equal(proposal.admissionAuthorized, false);
});

test('missing packet source revision produces REVISION_MISMATCH', () => {
  const input = sampleInput();
  input.packetSourceRevision = null;
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.equal(proposal.status, 'REVISION_MISMATCH');
  assert.equal(proposal.admissionAuthorized, false);
});

test('content digest mismatch produces DIGEST_MISMATCH', () => {
  const input = sampleInput();
  input.packetContentDigest = 'different_digest_value';
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.equal(proposal.status, 'DIGEST_MISMATCH');
  assert.equal(proposal.admissionAuthorized, false);
});

test('chunk content digests are preserved as distinct non-promoted array', () => {
  const input = sampleInput();
  input.chunkContentDigests = ['chunk1_hash', 'chunk2_hash'];
  const proposal = evaluatePacketDigestBridgeRow(input);
  assert.deepEqual(proposal.chunkContentDigests, ['chunk1_hash', 'chunk2_hash']);
});

test('normalizeSourceRef normalizes paths properly', () => {
  assert.equal(normalizeSourceRef('.\\foo\\bar.ts'), 'foo/bar.ts');
  assert.equal(normalizeSourceRef('src/lib/index.ts'), 'src/lib/index.ts');
});
