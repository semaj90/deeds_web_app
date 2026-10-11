/**
 * Read-only packet-key scheme audit. No UUID minting, alias migration, SQL or I/O.
 * Adapted 2026-10-11 from the operator-supplied packet-key-audit-v2 patch.
 *
 * The two patterns below DUPLICATE the owners (packet-key-v2.ts `PACKET_KEY_V2_PATTERN`,
 * packet-key-legacy-alias-v1.ts `LEGACY_PACKET_KEY_V1_PATTERN`) because a .mjs cannot import
 * TypeScript. Drift is caught by packet-key-scheme-audit-v2.parity.test.mts, which imports
 * both owners; run it whenever either owner changes.
 *
 * Changes vs the supplied patch:
 *  - ACE prefix is `ace:packet:<12hex>` (live census: all 3,294 such keys match this strictly);
 *    any other `ace:packet:*` spelling is OTHER and flagged.
 *  - requireCanonicalV2Proof is renamed requireCanonicalV2ProofClaimV1 (old name kept as an
 *    alias): the verified* flags are CALLER ASSERTIONS, so the best outcome is
 *    DERIVATION_CLAIM_CHECKED_ONLY, never an authorization.
 */
export const PACKET_KEY_V2_PATTERN = /^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const LEGACY_PACKET_KEY_V1_PATTERN = /^packet:[0-9a-f]{12}$/;
export const ACE_PREFIX_PATTERN = /^ace:packet:[0-9a-f]{12}$/;

export const PACKET_KEY_SCHEMES_V2 = Object.freeze([
  'MISSING', 'PACKET_KEY_V2_SHAPE', 'LEGACY_V1_12HEX', 'ACE_PREFIX', 'SHA256_PREFIXED_OTHER', 'OTHER',
]);

export function classifyPacketKeySchemeV2(packetKey) {
  if (typeof packetKey !== 'string' || packetKey.length === 0) return 'MISSING';
  if (PACKET_KEY_V2_PATTERN.test(packetKey)) return 'PACKET_KEY_V2_SHAPE';
  if (LEGACY_PACKET_KEY_V1_PATTERN.test(packetKey)) return 'LEGACY_V1_12HEX';
  if (ACE_PREFIX_PATTERN.test(packetKey)) return 'ACE_PREFIX';
  if (packetKey.startsWith('sha256:')) return 'SHA256_PREFIXED_OTHER';
  return 'OTHER';
}

/** A shape match is NEVER proof this UUID was derived using the canonical namespace. */
export function auditPacketKeySchemesV2(rows) {
  if (!Array.isArray(rows)) throw new TypeError('PACKET_ROWS_REQUIRED');
  const counts = Object.fromEntries(PACKET_KEY_SCHEMES_V2.map((scheme) => [scheme, 0]));
  const issues = [];
  for (let index = 0; index < rows.length; index += 1) {
    const scheme = classifyPacketKeySchemeV2(rows[index]?.packet_key);
    counts[scheme] += 1;
    if (scheme === 'MISSING' || scheme === 'OTHER') issues.push({ rowOrdinal: index, reason: scheme });
  }
  return {
    schema: 'atlas.packet-key-scheme-audit.v2',
    status: 'DIAGNOSTIC_ONLY',
    counts,
    rowCount: rows.length,
    issues,
    canonicalAuthority: false,
    writesPerformed: false,
    migrationPerformed: false,
  };
}

/** Reject any attempt to treat a legacy/ACE key as PacketKeyV2 on syntax alone; flags are caller claims. */
export function requireCanonicalV2ProofClaimV1(input) {
  if (classifyPacketKeySchemeV2(input?.packet_key) !== 'PACKET_KEY_V2_SHAPE') {
    return { status: 'BLOCKED', reason: 'NOT_V2_SHAPE' };
  }
  if (input?.verifiedDerivation !== true || input?.verifiedRepositoryMembership !== true || input?.verifiedSourceBinding !== true) {
    return { status: 'BLOCKED', reason: 'V2_PROVENANCE_UNVERIFIED' };
  }
  if (typeof input.source_revision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(input.source_revision)) {
    return { status: 'BLOCKED', reason: 'SOURCE_REVISION_INVALID' };
  }
  return {
    status: 'DERIVATION_CLAIM_CHECKED_ONLY',
    packetKey: input.packet_key,
    sourceRevision: input.source_revision,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
export const requireCanonicalV2Proof = requireCanonicalV2ProofClaimV1;
