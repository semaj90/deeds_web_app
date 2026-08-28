export const AliasTargetRegistryClassification = Object.freeze({
  CANONICAL_TARGET_REGISTERED_UNIQUE: 'CANONICAL_TARGET_REGISTERED_UNIQUE',
  CANONICAL_TARGET_MISSING: 'CANONICAL_TARGET_MISSING',
  CANONICAL_TARGET_DUPLICATE: 'CANONICAL_TARGET_DUPLICATE',
  REPO_ID_MISMATCH: 'REPO_ID_MISMATCH',
  ALIAS_SELECTION_CHECKSUM_MISMATCH: 'ALIAS_SELECTION_CHECKSUM_MISMATCH',
});

export function classifyAliasTargetRegistry({ target, matches, expectedRepoId = null, checksumValid = true }) {
  if (!checksumValid) return AliasTargetRegistryClassification.ALIAS_SELECTION_CHECKSUM_MISMATCH;
  if (expectedRepoId && matches.some((row) => String(row.repo_id ?? '') !== expectedRepoId)) return AliasTargetRegistryClassification.REPO_ID_MISMATCH;
  if (matches.length === 0) return AliasTargetRegistryClassification.CANONICAL_TARGET_MISSING;
  if (matches.length > 1) return AliasTargetRegistryClassification.CANONICAL_TARGET_DUPLICATE;
  return AliasTargetRegistryClassification.CANONICAL_TARGET_REGISTERED_UNIQUE;
}

export function summarizeAliasTargetRegistry(rows) {
  const counts = Object.fromEntries(Object.values(AliasTargetRegistryClassification).map((key) => [key, 0]));
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return { counts, registeredUniqueTargets: counts.CANONICAL_TARGET_REGISTERED_UNIQUE ?? 0, missingTargets: counts.CANONICAL_TARGET_MISSING ?? 0, duplicateTargets: counts.CANONICAL_TARGET_DUPLICATE ?? 0 };
}
