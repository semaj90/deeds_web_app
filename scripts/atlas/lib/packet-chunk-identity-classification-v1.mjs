export const PACKET_CHUNK_IDENTITY_CATEGORIES_V1 = Object.freeze([
  'NO_PACKET_REFERENCE',
  'PACKET_PRESENT_NO_CHUNK_BINDING',
  'CANONICAL_PACKET_IDENTITY_ONLY',
  'EXACT_LINEAGE',
  'AMBIGUOUS_MULTI_MATCH',
  'LEGACY_HASH_ONLY_DIAGNOSTIC',
]);

const normalize = (value) => String(value ?? '').trim().toLowerCase();

export function classifyPacketChunkIdentityV1(row) {
  const sourceRevision = normalize(row.source_revision);
  const contentDigest = normalize(row.content_digest);
  const packets = Array.isArray(row.packet_rows) ? row.packet_rows : [];
  const lineage = Array.isArray(row.lineage_rows) ? row.lineage_rows : [];
  const packetRows = packets.filter((packet) => packet.packet_key != null);
  const packetKeys = [...new Set(packetRows.map((packet) => normalize(packet.packet_key)))];
  const result = (category, packetKeyCount) => ({
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    sourceContentDigest: row.content_digest,
    category,
    packetKeyCount,
  });

  if (packetKeys.length > 1) {
    return result('AMBIGUOUS_MULTI_MATCH', packetKeys.length);
  }
  if (packetKeys.length === 0) {
    return result('NO_PACKET_REFERENCE', 0);
  }

  const packetKey = packetKeys[0];
  const identityQualified = packetRows.some((packet) =>
    normalize(packet.source_revision) === sourceRevision
    && Boolean(normalize(packet.lineage_binding_checksum))
    && Boolean(normalize(packet.lineage_producer_revision)));
  const exactLineage = lineage.some((item) =>
    normalize(item.packet_key) === packetKey
    && normalize(item.source_revision) === sourceRevision
    && item.chunk_row_exists === true);

  if (identityQualified && exactLineage) {
    return result('EXACT_LINEAGE', 1);
  }
  if (identityQualified) {
    return result('CANONICAL_PACKET_IDENTITY_ONLY', 1);
  }

  const legacyDigestMatch = packetRows.some((packet) => normalize(packet.legacy_sha256) === contentDigest && contentDigest.length > 0);
  if (legacyDigestMatch) {
    return result('LEGACY_HASH_ONLY_DIAGNOSTIC', 1);
  }
  return result('PACKET_PRESENT_NO_CHUNK_BINDING', 1);
}

export function summarizePacketChunkIdentityClassificationsV1(classifications) {
  const counts = Object.fromEntries(PACKET_CHUNK_IDENTITY_CATEGORIES_V1.map((category) => [category, 0]));
  for (const item of classifications) {
    if (!Object.hasOwn(counts, item.category)) throw new Error('PACKET_CHUNK_IDENTITY_CATEGORY_UNKNOWN');
    counts[item.category] += 1;
  }
  return {
    rowCount: classifications.length,
    classifiedRowCount: Object.values(counts).reduce((total, count) => total + count, 0),
    counts,
  };
}
