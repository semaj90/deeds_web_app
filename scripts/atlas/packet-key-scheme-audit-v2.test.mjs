import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPacketKeySchemeV2 as classify,
  auditPacketKeySchemesV2,
  requireCanonicalV2ProofClaimV1,
  requireCanonicalV2Proof,
} from './lib/packet-key-scheme-audit-v2.mjs';

const v2 = 'packet:12345678-1234-5123-8123-123456789abc';
const sha = `sha256:${'a'.repeat(64)}`;
const claim = { packet_key: v2, verifiedDerivation: true, verifiedRepositoryMembership: true, verifiedSourceBinding: true };

test('v2 UUID shape only', () => assert.equal(classify(v2), 'PACKET_KEY_V2_SHAPE'));
test('legacy v1', () => assert.equal(classify('packet:abcdef012345'), 'LEGACY_V1_12HEX'));
test('ACE prefix is strictly ace:packet:<12hex>', () => {
  assert.equal(classify('ace:packet:abcdef012345'), 'ACE_PREFIX');
  assert.equal(classify('ace:packet:abc'), 'OTHER');
  assert.equal(classify('ace:packet:abcdef012345/extra'), 'OTHER');
});
test('sha256-prefixed is other, not a packet key', () => assert.equal(classify('sha256:abc'), 'SHA256_PREFIXED_OTHER'));
test('empty and unknown', () => {
  assert.equal(classify(''), 'MISSING');
  assert.equal(classify(null), 'MISSING');
  assert.equal(classify('packet:a'), 'OTHER');
});
test('bad UUID version and variant are not v2', () => {
  assert.equal(classify('packet:12345678-1234-4123-8123-123456789abc'), 'OTHER');
  assert.equal(classify('packet:12345678-1234-5123-7123-123456789abc'), 'OTHER');
});
test('audit counts are read-only diagnostic and flag MISSING/OTHER', () => {
  const r = auditPacketKeySchemesV2([{ packet_key: v2 }, { packet_key: 'packet:abcdef012345' }, { packet_key: 'ace:packet:abcdef012345' }, { packet_key: null }, { packet_key: 'weird' }]);
  assert.equal(r.rowCount, 5);
  assert.equal(r.counts.MISSING, 1);
  assert.equal(r.counts.OTHER, 1);
  assert.deepEqual(r.issues.map((i) => i.reason), ['MISSING', 'OTHER']);
  assert.equal(r.writesPerformed, false);
  assert.equal(r.canonicalAuthority, false);
  assert.equal(r.migrationPerformed, false);
});
test('shape alone cannot be promoted', () => assert.equal(requireCanonicalV2ProofClaimV1({ packet_key: v2 }).status, 'BLOCKED'));
test('requires all three claims and a valid source revision; best outcome is claim-checked only', () => {
  assert.equal(requireCanonicalV2ProofClaimV1(claim).reason, 'SOURCE_REVISION_INVALID');
  assert.equal(requireCanonicalV2ProofClaimV1({ ...claim, verifiedSourceBinding: false, source_revision: sha }).reason, 'V2_PROVENANCE_UNVERIFIED');
  const ok = requireCanonicalV2ProofClaimV1({ ...claim, source_revision: sha });
  assert.equal(ok.status, 'DERIVATION_CLAIM_CHECKED_ONLY');
  assert.equal(ok.canonicalAuthority, false);
  assert.equal(ok.writesPerformed, false);
});
test('legacy key promotion is rejected even with claimed flags', () => {
  assert.equal(requireCanonicalV2ProofClaimV1({ ...claim, packet_key: 'packet:abcdef012345', source_revision: sha }).reason, 'NOT_V2_SHAPE');
});
test('old name remains an alias of the renamed guard', () => assert.equal(requireCanonicalV2Proof, requireCanonicalV2ProofClaimV1));
