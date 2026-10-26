const SHA256_SOURCE_REVISION = /^sha256:[a-f0-9]{64}$/i;

/**
 * Resolve packet identity only from canonical packet rows. A source reference
 * or its hash may help locate rows, but it can never mint packet identity.
 */
export function resolveCanonicalPacketIdentity(rows) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.packet_key != null)
    .map((row) => String(row.packet_key));
  const uniqueCandidates = [...new Set(candidates)].sort();
  if (uniqueCandidates.length === 0) {
    return { status: 'MISSING_PACKET', packetKey: null, candidates: [] };
  }
  if (uniqueCandidates.length !== 1) {
    return { status: 'PACKET_IDENTITY_AMBIGUOUS', packetKey: null, candidates: uniqueCandidates };
  }
  return { status: 'CANONICAL_PACKET_FOUND', packetKey: uniqueCandidates[0], candidates: uniqueCandidates };
}

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

export function classifyPacketDigestBridgeRows(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const sourceRef = String(row?.source_ref ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
    const key = `${sourceRef}\0${String(row?.workspace_revision ?? '')}\0${String(row?.code_source_revision ?? '')}\0${String(row?.member_content_hash ?? '')}`;
    const group = groups.get(key) ?? { sourceRef: row?.source_ref ?? null,
      workspaceRevision: row?.workspace_revision ?? null, codeSourceRevision: row?.code_source_revision ?? null,
      memberContentHash: row?.member_content_hash ?? null, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.values()].map(({ sourceRef, workspaceRevision, codeSourceRevision, memberContentHash, rows: candidates }) => {
    const identity = resolveCanonicalPacketIdentity(candidates);
    if (identity.status === 'PACKET_IDENTITY_AMBIGUOUS') {
      return { sourceRef, workspaceRevision, codeSourceRevision, memberContentHash, packetKey: null,
        classification: identity.status, promotionEligible: false,
        packetCandidates: identity.candidates };
    }
    if (identity.status === 'MISSING_PACKET') {
      return { sourceRef, workspaceRevision, codeSourceRevision, memberContentHash, packetKey: null,
        classification: 'MISSING_PACKET', promotionEligible: false,
        packetCandidates: [] };
    }
    const packetRows = candidates.filter((row) => String(row.packet_key) === identity.packetKey);
    const packetSignatures = new Set(packetRows.map((row) => JSON.stringify([
      String(row.packet_content_hash ?? '').toLowerCase(),
      String(row.packet_source_revision ?? '').toLowerCase(),
      String(row.legacy_sha256 ?? '').toLowerCase(),
    ])));
    if (packetSignatures.size > 1) {
      return { sourceRef, workspaceRevision, codeSourceRevision, memberContentHash,
        packetKey: identity.packetKey, classification: 'PACKET_CANONICAL_ROW_CONFLICT',
        promotionEligible: false };
    }
    return { sourceRef, workspaceRevision, codeSourceRevision, memberContentHash, packetKey: identity.packetKey,
      ...classifyPacketDigestBridgeRow(packetRows[0]) };
  });
}
