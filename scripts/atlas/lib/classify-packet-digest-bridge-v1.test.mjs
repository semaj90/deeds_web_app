import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPacketDigestBridgeRow,
  classifyPacketDigestBridgeRows,
  resolveCanonicalPacketIdentity,
} from './classify-packet-digest-bridge-v1.mjs';

const digest = 'sha256:' + 'a'.repeat(64);

test('missing canonical packet digest is distinct from mismatch', () => {
  const result = classifyPacketDigestBridgeRow({
    packet_key: 'packet:test',
    member_content_hash: digest,
    packet_content_hash: null,
    legacy_sha256: null,
    packet_source_revision: null,
  });
  assert.deepEqual(result, {
    classification: 'PACKET_CONTENT_DIGEST_MISSING',
    promotionEligible: false,
  });
});

test('digest mismatch remains non-promotional', () => {
  const result = classifyPacketDigestBridgeRow({
    packet_key: 'packet:test',
    member_content_hash: digest,
    packet_content_hash: 'sha256:' + 'b'.repeat(64),
    legacy_sha256: null,
    packet_source_revision: digest,
  });
  assert.equal(result.classification, 'PACKET_CONTENT_DIGEST_MISMATCH');
  assert.equal(result.promotionEligible, false);
});

test('packet identity is missing when no canonical row exists', () => {
  assert.deepEqual(resolveCanonicalPacketIdentity([]), {
    status: 'MISSING_PACKET',
    packetKey: null,
    candidates: [],
  });
});

test('packet identity is ambiguous when a source resolves to multiple rows', () => {
  assert.deepEqual(resolveCanonicalPacketIdentity([
    { packet_key: 'packet:a' },
    { packet_key: 'packet:b' },
  ]), {
    status: 'PACKET_IDENTITY_AMBIGUOUS',
    packetKey: null,
    candidates: ['packet:a', 'packet:b'],
  });
});

test('packet identity comes from the canonical row', () => {
  assert.deepEqual(resolveCanonicalPacketIdentity([{ packet_key: 'packet:canonical' }]), {
    status: 'CANONICAL_PACKET_FOUND',
    packetKey: 'packet:canonical',
    candidates: ['packet:canonical'],
  });
});

test('repeated joined rows for one packet remain a unique packet identity', () => {
  const rows = [
    { source_ref: 'src/a.ts', workspace_revision: 'sha256:workspace', member_content_hash: digest,
      packet_key: 'packet:a', packet_content_hash: digest, packet_source_revision: digest },
    { source_ref: 'src/a.ts', workspace_revision: 'sha256:workspace', member_content_hash: digest,
      packet_key: 'packet:a', packet_content_hash: digest, packet_source_revision: digest },
  ];
  const [result] = classifyPacketDigestBridgeRows(rows);
  assert.equal(result.classification, 'CANONICAL_CONTENT_DIGEST_MATCH');
  assert.equal(result.packetKey, 'packet:a');
});

test('conflicting canonical packet rows fail closed independent of row order', () => {
  const rows = [digest, 'sha256:' + 'b'.repeat(64)].map((packetContentHash) => ({
    source_ref: 'src/a.ts', workspace_revision: 'sha256:workspace', member_content_hash: digest,
    packet_key: 'packet:a', packet_content_hash: packetContentHash, packet_source_revision: digest,
  }));
  for (const candidates of [rows, [...rows].reverse()]) {
    const [result] = classifyPacketDigestBridgeRows(candidates);
    assert.equal(result.classification, 'PACKET_CANONICAL_ROW_CONFLICT');
    assert.equal(result.promotionEligible, false);
  }
});

test('multiple canonical packet keys for one source are ambiguous and non-promotable', () => {
  const rows = ['packet:a', 'packet:b'].map((packetKey) => ({
    source_ref: 'src/a.ts', workspace_revision: 'sha256:workspace', member_content_hash: digest,
    packet_key: packetKey, packet_content_hash: digest, packet_source_revision: digest,
  }));
  const [result] = classifyPacketDigestBridgeRows(rows);
  assert.equal(result.classification, 'PACKET_IDENTITY_AMBIGUOUS');
  assert.equal(result.packetKey, null);
  assert.deepEqual(result.packetCandidates, ['packet:a', 'packet:b']);
  assert.equal(result.promotionEligible, false);
});

test('source/workspace cohorts are never collapsed into one digest result', () => {
  const rows = ['sha256:workspace-a', 'sha256:workspace-b'].map((workspaceRevision) => ({
    source_ref: 'src/a.ts', workspace_revision: workspaceRevision, member_content_hash: digest,
    packet_key: 'packet:a', packet_content_hash: digest, packet_source_revision: digest,
  }));
  assert.equal(classifyPacketDigestBridgeRows(rows).length, 2);
});

test('different source revisions remain separate even for the same source bytes', () => {
  const rows = ['sha256:revision-a', 'sha256:revision-b'].map((codeSourceRevision) => ({
    source_ref: 'src/a.ts', workspace_revision: 'sha256:workspace', code_source_revision: codeSourceRevision,
    member_content_hash: digest, packet_key: 'packet:a', packet_content_hash: digest,
    packet_source_revision: digest,
  }));
  const results = classifyPacketDigestBridgeRows(rows);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((result) => result.codeSourceRevision), ['sha256:revision-a', 'sha256:revision-b']);
});
