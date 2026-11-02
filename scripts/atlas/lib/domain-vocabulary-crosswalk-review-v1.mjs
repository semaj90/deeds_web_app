import { normalizeLabel } from './domain-taxonomy-contract-v1.mjs';

const NORMALIZED_EXACT = 'NORMALIZED_EXACT';

export function reviewDomainVocabularyCrosswalkV1(rows, domains) {
  if (!Array.isArray(rows) || !Array.isArray(domains)) {
    return { status: 'BLOCKED_INVALID_INPUT', canonicalAuthority: false, rows: [], counts: {} };
  }

  const domainById = new Map(domains
    .filter((domain) => typeof domain?.id === 'string' && domain.id.trim())
    .map((domain) => [domain.id, domain]));
  const normalizedTargets = new Map();
  for (const domain of domainById.values()) {
    for (const label of [domain.id, domain.label]) {
      const key = normalizeLabel(label);
      if (key) normalizedTargets.set(key, domain.id);
    }
  }

  const keyCounts = new Map();
  for (const row of rows) {
    if (typeof row?.source_vocab !== 'string' || typeof row?.source_value !== 'string') continue;
    const key = `${row.source_vocab}\u0000${row.source_value}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  const decisions = rows.map((row) => {
    const validSource = typeof row?.source_vocab === 'string' && row.source_vocab.trim()
      && typeof row?.source_value === 'string';
    const sourceKey = validSource ? `${row.source_vocab}\u0000${row.source_value}` : null;
    const duplicateSourceKey = sourceKey !== null && keyCounts.get(sourceKey) > 1;
    const targetId = typeof row?.taxonomy_domain_id === 'string' && row.taxonomy_domain_id.trim()
      ? row.taxonomy_domain_id
      : null;
    const target = targetId ? domainById.get(targetId) : null;
    let state;
    let reason;

    if (!validSource || typeof row?.match_method !== 'string') {
      state = 'BLOCKED_INVALID_ROW';
      reason = 'SOURCE_OR_MATCH_METHOD_MISSING';
    } else if (row.canonical === true) {
      state = 'BLOCKED_CANONICAL_FLAG_PRESENT';
      reason = 'REQUIRES_SEPARATE_AUTHORITY_REVIEW';
    } else if (duplicateSourceKey) {
      state = 'REVIEW_REQUIRED_DUPLICATE_SOURCE_KEY';
      reason = 'SOURCE_KEY_NOT_UNIQUE';
    } else if (row.source_value.trim() === '') {
      state = row.match_method === 'UNRESOLVED' ? 'UNRESOLVED_EMPTY_SOURCE_VALUE' : 'REVIEW_REQUIRED_EMPTY_SOURCE_VALUE';
      reason = 'EMPTY_SOURCE_LABEL_IS_NOT_A_TAXONOMY_BINDING';
    } else if (row.match_method === 'UNRESOLVED') {
      state = 'UNRESOLVED';
      reason = 'SOURCE_HAS_NO_RESOLVED_TAXONOMY_TARGET';
    } else if (!targetId) {
      state = row.match_method === NORMALIZED_EXACT ? 'REVIEW_REQUIRED_TARGET_MISSING' : 'UNRESOLVED';
      reason = 'TARGET_ID_MISSING';
    } else if (!target || target.active === false) {
      state = 'REVIEW_REQUIRED_TARGET_UNKNOWN_OR_INACTIVE';
      reason = target ? 'TARGET_INACTIVE' : 'TARGET_NOT_IN_TAXONOMY';
    } else if (row.match_method === NORMALIZED_EXACT
      && normalizedTargets.get(normalizeLabel(row.source_value)) !== targetId) {
      state = 'REVIEW_REQUIRED_NORMALIZATION_MISMATCH';
      reason = 'SHARED_NORMALIZER_DOES_NOT_REPRODUCE_TARGET';
    } else if (row.match_method === NORMALIZED_EXACT) {
      state = 'PROPOSED_NORMALIZED_EXACT';
      reason = 'REPRODUCIBLE_EXACT_MATCH_STILL_NONCANONICAL';
    } else {
      state = 'PROPOSED_METHOD_REVIEW';
      reason = 'MATCH_METHOD_REQUIRES_REVIEW';
    }

    return {
      source_vocab: row?.source_vocab ?? null,
      source_value: row?.source_value ?? null,
      taxonomy_domain_id: targetId,
      match_method: row?.match_method ?? null,
      source_row_count: Number.isSafeInteger(row?.source_row_count) ? row.source_row_count : null,
      crosswalk_version: row?.crosswalk_version ?? null,
      canonical: row?.canonical === true,
      state,
      reason,
      canonicalAuthority: false,
    };
  });

  const counts = decisions.reduce((result, row) => {
    result[row.state] = (result[row.state] ?? 0) + 1;
    return result;
  }, {});

  return { status: 'REVIEWED_PROPOSAL_ONLY', canonicalAuthority: false, rows: decisions, counts };
}

export function summarizeMissingFeatureIdsV1(rows, totalRowCount = rows?.length) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(totalRowCount) || totalRowCount < rows.length) {
    return { status: 'BLOCKED_INVALID_INPUT', rowCount: null, missingFeatureIdCount: null, canonicalAuthority: false };
  }
  const missing = rows.filter((row) => typeof row?.feature_id !== 'string' || row.feature_id.trim() === '');
  return {
    status: missing.length ? 'REVIEW_REQUIRED_MISSING_FEATURE_IDS' : 'NO_MISSING_FEATURE_IDS_IN_CENSUS',
    rowCount: totalRowCount,
    missingFeatureIdCount: missing.length,
    missingRows: missing.map((row) => ({ normalized_path: row.normalized_path ?? null, source_ref: row.source_ref ?? null })),
    canonicalAuthority: false,
  };
}
