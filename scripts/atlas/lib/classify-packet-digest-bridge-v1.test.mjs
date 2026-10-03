import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPacketDigestBridgeRow,
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
