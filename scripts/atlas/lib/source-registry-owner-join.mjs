/**
 * Pure join-classification logic for SOURCE-REGISTRY-OWNER-JOIN-01.
 *
 * `atlas_source_refs` (the stable source-identity registry, 22,604 rows /
 * 4,598 distinct files) is keyed on `relative_path` relative to
 * `sveltekit-frontend/` (verified live: rows look like
 * `src/lib/server/db/schema-postgres.ts`, repo_id: 'deeds-web-app' -- a
 * DIFFERENT repositoryId convention than 'semaj90/deeds_web_app' used
 * elsewhere in this repo's Graphify/workspace-origin tooling; that mismatch
 * is itself a real namespace-authority gap, not something to paper over).
 *
 * This module never guesses a namespace for an unmatched source. A source
 * with no exact registry row is SOURCE_REGISTRY_IDENTITY_UNPROVEN --
 * full stop, not a fuzzy path-only promotion.
 */

/**
 * Normalize a Graphify-style sourceRef (e.g.
 * "sveltekit-frontend/src/lib/x.ts") to the registry's relative_path form
 * (e.g. "src/lib/x.ts"). Only strips the exact "sveltekit-frontend/" prefix
 * -- never a fuzzy basename-only match.
 */
export function toRegistryRelativePath(sourceRef) {
  const prefix = 'sveltekit-frontend/';
  return sourceRef.startsWith(prefix) ? sourceRef.slice(prefix.length) : sourceRef;
}

/**
 * @param {string} sourceRef the original Graphify-style sourceRef
 * @param {Array<{source_ref_key:string, repo_id:string, relative_path:string, content_hash:string}>} registryRows rows already fetched for this sourceRef's relative_path
 */
export function classifySourceRegistryJoin(sourceRef, registryRows) {
  const relativePath = toRegistryRelativePath(sourceRef);
  if (registryRows.length === 0) {
    return { sourceRef, relativePath, status: 'SOURCE_REGISTRY_IDENTITY_UNPROVEN', reason: 'NO_EXACT_RELATIVE_PATH_MATCH', matchCount: 0 };
  }
  const distinctRepoIds = new Set(registryRows.map((row) => row.repo_id));
  if (distinctRepoIds.size > 1) {
    return { sourceRef, relativePath, status: 'SOURCE_REGISTRY_IDENTITY_UNPROVEN', reason: 'AMBIGUOUS_REPO_ID', matchCount: registryRows.length };
  }
  return {
    sourceRef,
    relativePath,
    status: 'EXACT_REGISTRY_MATCH',
    reason: null,
    matchCount: registryRows.length,
    repoId: registryRows[0].repo_id,
    sourceRefKeys: registryRows.map((row) => row.source_ref_key),
  };
}
