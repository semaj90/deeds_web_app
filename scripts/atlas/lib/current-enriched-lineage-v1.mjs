/** Classify the existing current-enriched-index packet lineage without promoting compatibility hashes. */
export function classifyCurrentEnrichedLineageV1({
  packetKey,
  packetSourceRevision,
  sourceRevision,
  packetSha256,
  chunkRows = 0,
}) {
  if (!packetKey) return chunkRows > 0 ? 'LEGACY_ONLY' : 'IDENTITY_UNRESOLVED';
  if (!packetSourceRevision || !sourceRevision) return 'REVISION_MISSING';
  if (String(packetSourceRevision).toLowerCase() !== String(sourceRevision).toLowerCase()) return 'REVISION_CONFLICT';
  if (packetSha256 && String(packetSha256).toLowerCase() !== String(sourceRevision).replace(/^sha256:/i, '').toLowerCase()) {
    return 'REVISION_QUALIFIED_PACKET_SHA256_STALE';
  }
  return 'REVISION_QUALIFIED';
}
