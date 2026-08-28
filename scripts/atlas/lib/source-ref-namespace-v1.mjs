/** Deterministic source-reference namespace classification; no fuzzy matching. */

export function normalizeSourceRef(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim()
    .toLowerCase();
}

export function buildApprovedAliasMap(approvedPairs = []) {
  const map = new Map();
  for (const pair of approvedPairs) {
    const alias = normalizeSourceRef(pair.aliasSourceRef);
    const canonical = normalizeSourceRef(pair.canonicalSourceRef);
    if (!alias || !canonical || alias === canonical) continue;
    if (map.has(alias) && map.get(alias) !== canonical) {
      throw new Error(`conflicting approved aliases for ${alias}`);
    }
    map.set(alias, canonical);
  }
  return map;
}

export function classifySourceRef({ manifestRef, projectionRefs = [], approvedAliases = new Map(), canonicalAdmission = true }) {
  const canonical = normalizeSourceRef(manifestRef);
  const projections = [...new Set(projectionRefs.map(normalizeSourceRef).filter(Boolean))].sort();
  if (!canonical) return { classification: 'EMPTY_IDENTITY', canonicalSourceRef: null, matchedProjectionRefs: [] };
  if (canonicalAdmission === false) return { classification: 'EXCLUDED', canonicalSourceRef: canonical, matchedProjectionRefs: [] };
  if (projections.includes(canonical)) {
    return { classification: 'EXACT_CURRENT', canonicalSourceRef: canonical, matchedProjectionRefs: [canonical], aliasSourceRefs: [] };
  }
  const aliasMatches = projections.filter((ref) => approvedAliases.get(ref) === canonical);
  if (aliasMatches.length === 1) {
    return { classification: 'APPROVED_ALIAS_CURRENT', canonicalSourceRef: canonical, matchedProjectionRefs: aliasMatches, aliasSourceRefs: aliasMatches };
  }
  if (aliasMatches.length > 1) {
    return { classification: 'AMBIGUOUS_ALIAS', canonicalSourceRef: canonical, matchedProjectionRefs: aliasMatches, aliasSourceRefs: aliasMatches };
  }
  return { classification: 'UNRESOLVED', canonicalSourceRef: canonical, matchedProjectionRefs: [], aliasSourceRefs: [] };
}
