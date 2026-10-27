/**
 * Pure scope -> persisted repository resolution. No I/O, no hardcoded repository UUID.
 * A membership scope is a string label (graphify_execution_file_membership_v2.repository_id). It is never a UUID and is
 * never renamed or coerced into one; a UUID is returned only from a persisted atlas_repository_identity row.
 */

export const ROOT_SCOPE = 'repo:root';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{scopes: string[], identityRows: Array<{repository_id:string, source_authority_repo_id:string, repository_kind:string, gitmodule_name?:string|null, parent_repository_id?:string|null}>}} input
 */
export function resolveRepositoryScopes({ scopes, identityRows }) {
  const rows = identityRows.filter((row) => UUID.test(row.repository_id ?? ''));
  const roots = rows.filter((row) => row.repository_kind === 'ROOT' && !row.parent_repository_id);
  const results = [];
  const seenFolded = new Map();

  for (const scope of [...new Set(scopes)].sort()) {
    const folded = scope.toLowerCase();
    const collision = seenFolded.get(folded);
    seenFolded.set(folded, scope);
    if (collision && collision !== scope) {
      results.push({ scope, status: 'SCOPE_AMBIGUOUS', reason: `CASE_FOLD_COLLISION:${collision}`, repositoryId: null });
      continue;
    }
    if (scope === ROOT_SCOPE) {
      if (roots.length === 1) results.push({ scope, status: 'MAPPED', reason: 'SINGLE_PERSISTED_ROOT_IDENTITY', repositoryId: roots[0].repository_id, sourceAuthorityRepoId: roots[0].source_authority_repo_id });
      else results.push({ scope, status: roots.length === 0 ? 'SCOPE_UNRESOLVED' : 'SCOPE_AMBIGUOUS', reason: roots.length === 0 ? 'NO_PERSISTED_ROOT_IDENTITY' : `MULTIPLE_PERSISTED_ROOT_IDENTITIES:${roots.length}`, repositoryId: null });
      continue;
    }
    // Nested scope: exact `repo:<name>` match against a persisted nested row's gitmodule_name or source_authority_repo_id.
    const name = scope.startsWith('repo:') ? scope.slice('repo:'.length) : null;
    const candidates = name === null ? [] : rows.filter((row) => row.repository_kind === 'NESTED_GIT_REPOSITORY' && (row.gitmodule_name === name || row.source_authority_repo_id === name));
    if (candidates.length === 1) {
      const parentOk = roots.length === 1 && candidates[0].parent_repository_id === roots[0].repository_id;
      results.push(parentOk
        ? { scope, status: 'MAPPED', reason: 'EXACT_NESTED_IDENTITY_WITH_ROOT_PARENT', repositoryId: candidates[0].repository_id, sourceAuthorityRepoId: candidates[0].source_authority_repo_id }
        : { scope, status: 'SCOPE_MISMATCH', reason: 'NESTED_IDENTITY_PARENT_NOT_THE_SINGLE_ROOT', repositoryId: null });
    } else if (candidates.length > 1) {
      results.push({ scope, status: 'SCOPE_AMBIGUOUS', reason: `MULTIPLE_NESTED_IDENTITIES:${candidates.length}`, repositoryId: null });
    } else {
      results.push({ scope, status: 'SCOPE_UNRESOLVED', reason: name === null ? 'SCOPE_LABEL_NOT_REPO_PREFIXED' : 'NO_PERSISTED_NESTED_IDENTITY', repositoryId: null });
    }
  }
  return results;
}
