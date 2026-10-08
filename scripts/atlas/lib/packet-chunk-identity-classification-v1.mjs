export const PACKET_CHUNK_IDENTITY_CATEGORIES_V1 = Object.freeze([
  'NO_PACKET_REFERENCE',
  'PACKET_PRESENT_NO_CHUNK_BINDING',
  'CANONICAL_PACKET_IDENTITY_ONLY',
  'EXACT_LINEAGE',
  'AMBIGUOUS_MULTI_MATCH',
  'LEGACY_HASH_ONLY_DIAGNOSTIC',
]);

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const normalizeSourceRef = (value) => normalize(value).replace(/\\/g, '/').replace(/^\.\//, '');

export function classifyPacketChunkIdentityV1(row) {
  const sourceRevision = normalize(row.source_revision);
  const contentDigest = normalize(row.content_digest);
  const packets = Array.isArray(row.packet_rows) ? row.packet_rows : [];
  const lineage = Array.isArray(row.lineage_rows) ? row.lineage_rows : [];
  const packetLineage = Array.isArray(row.packet_lineage_rows) ? row.packet_lineage_rows : null;
  const packetRows = packets.filter((packet) => packet.packet_key != null);
  const packetKeys = [...new Set(packetRows.map((packet) => normalize(packet.packet_key)))];
  const sourceChunkDiagnostic = row.source_chunk_diagnostic && typeof row.source_chunk_diagnostic === 'object'
    ? row.source_chunk_diagnostic
    : {};
  const exactSourceRefChunkCount = Number(sourceChunkDiagnostic.exactSourceRefChunkCount ?? 0);
  const sourceRefChunkDiagnostic = exactSourceRefChunkCount > 0
    ? 'SOURCE_REF_CHUNKS_PRESENT_REVISION_UNQUALIFIED'
    : 'NO_CHUNKS_AT_EXACT_SOURCE_REF';
  const result = (category, packetKeyCount, reasonCode) => ({
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    sourceContentDigest: row.content_digest,
    category,
    packetKeyCount,
    reasonCode,
    sourceRefChunkDiagnostic,
  });

  if (packetKeys.length > 1) {
    return result('AMBIGUOUS_MULTI_MATCH', packetKeys.length, 'MULTIPLE_PACKET_KEYS');
  }
  if (packetKeys.length === 0) {
    return result('NO_PACKET_REFERENCE', 0, 'NO_PACKET_ROWS_WITH_CANONICAL_KEY');
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
    return result('EXACT_LINEAGE', 1, 'PACKET_KEY_REVISION_AND_CHUNK_ROW_MATCH');
  }
  if (identityQualified) {
    const matchingLineage = lineage.filter((item) =>
      normalize(item.packet_key) === packetKey
      && normalize(item.source_revision) === sourceRevision);
    const history = packetLineage ?? lineage;
    const matchingPacketHistory = history.filter((item) => normalize(item.packet_key) === packetKey);
    const matchingSourceHistory = matchingPacketHistory.filter((item) =>
      item.lineage_source_ref == null || normalizeSourceRef(item.lineage_source_ref) === normalizeSourceRef(row.source_ref));
    const reasonCode = matchingLineage.some((item) => item.chunk_row_exists !== true)
      ? 'MATCHING_LINEAGE_CHUNK_ROW_MISSING'
      : matchingSourceHistory.some((item) => normalize(item.revision_status).toUpperCase() === 'UNPROVEN')
        ? 'PACKET_LINEAGE_PRESENT_UNPROVEN'
        : matchingSourceHistory.some((item) => normalize(item.revision_status).toUpperCase() === 'PROVEN')
          ? 'PROVEN_LINEAGE_SOURCE_REVISION_MISMATCH'
          : matchingSourceHistory.some((item) => normalize(item.source_revision) !== sourceRevision)
            ? 'PROVEN_LINEAGE_SOURCE_REVISION_MISMATCH'
          : matchingPacketHistory.length > 0
            ? 'PACKET_LINEAGE_SOURCE_REF_MISMATCH'
            : history.length === 0
              ? 'NO_PACKET_LINEAGE_ROWS'
              : 'PROVEN_LINEAGE_PACKET_KEY_MISMATCH';
    return result('CANONICAL_PACKET_IDENTITY_ONLY', 1, reasonCode);
  }

  const legacyDigestMatch = packetRows.some((packet) => normalize(packet.legacy_sha256) === contentDigest && contentDigest.length > 0);
  if (legacyDigestMatch) {
    return result('LEGACY_HASH_ONLY_DIAGNOSTIC', 1, 'LEGACY_DIGEST_MATCH_WITHOUT_QUALIFIED_PACKET_IDENTITY');
  }
  const currentRevisionPackets = packetRows.filter((packet) => normalize(packet.source_revision) === sourceRevision);
  if (currentRevisionPackets.length === 0) {
    return result('PACKET_PRESENT_NO_CHUNK_BINDING', 1, 'PACKET_SOURCE_REVISION_MISMATCH');
  }
  const missingBindingChecksum = currentRevisionPackets.some((packet) => !normalize(packet.lineage_binding_checksum));
  const missingProducerRevision = currentRevisionPackets.some((packet) => !normalize(packet.lineage_producer_revision));
  const reasonCode = missingBindingChecksum && missingProducerRevision
    ? 'PACKET_LINEAGE_PROVENANCE_MISSING'
    : missingBindingChecksum
      ? 'PACKET_LINEAGE_BINDING_CHECKSUM_MISSING'
      : 'PACKET_LINEAGE_PRODUCER_REVISION_MISSING';
  return result('PACKET_PRESENT_NO_CHUNK_BINDING', 1, reasonCode);
}

export function summarizePacketChunkIdentityClassificationsV1(classifications) {
  const counts = Object.fromEntries(PACKET_CHUNK_IDENTITY_CATEGORIES_V1.map((category) => [category, 0]));
  for (const item of classifications) {
    if (!Object.hasOwn(counts, item.category)) throw new Error('PACKET_CHUNK_IDENTITY_CATEGORY_UNKNOWN');
    counts[item.category] += 1;
  }
  const reasonCounts = {};
  const sourceRefChunkDiagnosticCounts = {};
  const sourceRefChunkDiagnosticCountsByCategory = {};
  for (const item of classifications) {
    if (typeof item.reasonCode !== 'string' || item.reasonCode.length === 0) continue;
    reasonCounts[item.reasonCode] = (reasonCounts[item.reasonCode] ?? 0) + 1;
    sourceRefChunkDiagnosticCounts[item.sourceRefChunkDiagnostic] = (sourceRefChunkDiagnosticCounts[item.sourceRefChunkDiagnostic] ?? 0) + 1;
    const categoryCounts = sourceRefChunkDiagnosticCountsByCategory[item.category] ??= {};
    categoryCounts[item.sourceRefChunkDiagnostic] = (categoryCounts[item.sourceRefChunkDiagnostic] ?? 0) + 1;
  }
  return {
    rowCount: classifications.length,
    classifiedRowCount: Object.values(counts).reduce((total, count) => total + count, 0),
    counts,
    ...(Object.keys(reasonCounts).length > 0
      ? { reasonCounts, sourceRefChunkDiagnosticCounts, sourceRefChunkDiagnosticCountsByCategory }
      : {}),
  };
}
