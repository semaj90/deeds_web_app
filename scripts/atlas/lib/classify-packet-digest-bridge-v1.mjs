const SHA256_SOURCE_REVISION = /^sha256:[a-f0-9]{64}$/i;

export function classifyPacketDigestBridgeRow(row) {
  const memberDigest = String(row.member_content_hash ?? '').toLowerCase();
  const packetDigest = String(row.packet_content_hash ?? '').toLowerCase();
  const legacyDigest = String(row.legacy_sha256 ?? '').toLowerCase();
  const packetRevision = row.packet_source_revision
    ? String(row.packet_source_revision).toLowerCase()
    : null;

  let classification = 'MISSING_PACKET';
  if (row.packet_key && packetDigest && packetDigest === memberDigest) {
    classification = packetRevision && SHA256_SOURCE_REVISION.test(packetRevision)
      ? 'CANONICAL_CONTENT_DIGEST_MATCH'
      : 'PACKET_SOURCE_REVISION_MISSING';
  } else if (row.packet_key && legacyDigest && legacyDigest === memberDigest) {
    classification = 'LEGACY_DIGEST_ONLY';
  } else if (row.packet_key && !packetDigest) {
    classification = 'PACKET_CONTENT_DIGEST_MISSING';
  } else if (row.packet_key) {
    classification = 'PACKET_CONTENT_DIGEST_MISMATCH';
  }

  return {
    classification,
    promotionEligible: classification === 'CANONICAL_CONTENT_DIGEST_MATCH',
  };
}
