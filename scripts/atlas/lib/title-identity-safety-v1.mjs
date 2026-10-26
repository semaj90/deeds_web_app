/**
 * Read-only title label audit + update-target guard (REGISTRY-LUT-01d/01e).
 * Adapted 2026-10-11 from the operator-supplied title-identity-review patch.
 * No SQL, no writes, no identity promotion. title_id is a LABEL (stable per
 * packet_key + generator version), never a join key.
 *
 * Changes vs the supplied patch:
 *  - Canonical format matches the repo grammar: no trailing or doubled dashes
 *    (`title:<slug>:<hash8>`, slug = [a-z0-9]+(-[a-z0-9]+)*), so malformed labels
 *    that backfill-title-identity.mjs repairs are NOT reported consistent.
 *  - source_digest must be `sha256:<64 hex>` and must come from the
 *    source-binding owner (atlas_packets has no source_digest column).
 *  - Optional injected `regenerate(packetKey, row)` flags rows whose stored label
 *    differs from the CURRENT generator (generator-version drift is expected for
 *    old rows; this is informational, never a rewrite instruction).
 */
export const TITLE_CANONICAL_FORMAT_V1 = /^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$/;
const SHA256_PREFIXED = /^sha256:[a-f0-9]{64}$/;

export function classifyTitleIdentityRowsV1(rows, { regenerate } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('TITLE_ROWS_REQUIRED');
  if (regenerate !== undefined && typeof regenerate !== 'function') throw new TypeError('REGENERATE_MUST_BE_FUNCTION');
  const byTitle = new Map();
  const issues = [];
  for (const row of rows) {
    const packetKey = row?.packet_key;
    const titleId = row?.title_id;
    if (typeof packetKey !== 'string' || !packetKey.trim()) {
      issues.push({ reason: 'PACKET_KEY_MISSING', titleId: titleId ?? null });
      continue;
    }
    if (titleId == null || titleId === '') {
      issues.push({ reason: 'TITLE_MISSING', packetKey });
      continue;
    }
    if (typeof titleId !== 'string' || !TITLE_CANONICAL_FORMAT_V1.test(titleId)) {
      issues.push({ reason: 'TITLE_FORMAT_NONCANONICAL', packetKey, titleId });
    } else if (regenerate) {
      const current = regenerate(packetKey, row);
      if (typeof current === 'string' && current !== titleId) {
        issues.push({ reason: 'TITLE_DIFFERS_FROM_CURRENT_GENERATOR', packetKey, titleId, current, informational: true });
      }
    }
    const list = byTitle.get(titleId) ?? [];
    list.push(packetKey);
    byTitle.set(titleId, list);
  }
  for (const [titleId, packets] of byTitle) {
    if (packets.length > 1) {
      issues.push({ reason: 'TITLE_AMBIGUOUS', titleId, packetKeys: [...packets].sort() });
    }
  }
  const blocking = issues.filter((issue) => !issue.informational);
  return {
    schema: 'atlas.title-identity-census.v1',
    status: blocking.length ? 'REVIEW_REQUIRED' : 'CONSISTENT_FIXTURE',
    rowCount: rows.length,
    issues,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/**
 * Guard only: never grants canonical authority or issues SQL. `expected` must
 * originate from independent owners (packet resolver + source-binding owner);
 * this function only compares the two supplied records.
 */
export function qualifyPacketUpdateTargetV1(row, expected) {
  const required = ['packet_key', 'source_ref', 'source_revision', 'workspace_revision', 'source_digest'];
  for (const key of required) {
    if (typeof row?.[key] !== 'string' || !row[key].trim()
        || typeof expected?.[key] !== 'string' || row[key] !== expected[key]) {
      return { status: 'BLOCKED', reason: 'IDENTITY_FIELD_MISMATCH', field: key };
    }
  }
  if (!SHA256_PREFIXED.test(row.source_digest)) {
    return { status: 'BLOCKED', reason: 'SOURCE_DIGEST_FORMAT_INVALID', field: 'source_digest' };
  }
  if (typeof row.title_id !== 'string' || row.title_id !== expected.title_id) {
    return { status: 'BLOCKED', reason: 'TITLE_LABEL_MISMATCH' };
  }
  return {
    status: 'QUALIFIED_TARGET_ONLY',
    packetKey: row.packet_key,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
