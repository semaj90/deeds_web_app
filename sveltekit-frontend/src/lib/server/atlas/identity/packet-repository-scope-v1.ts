/**
 * packet-repository-scope-v1.ts
 *
 * Canonical mapping for repository scope keys to persisted repository identities.
 * Replaces hardcoded string bridges ('repo:root' -> 'deeds-web-app') with a verified join
 * against atlas_graphify_scope_repository_map_v1 and atlas_repository_identity.
 */

export interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface ResolvedRepositoryScopeV1 {
  repositoryId: string;
  sourceAuthorityRepoId: string;
  membershipScope: string;
}

export const ScopeResolverErrorCode = Object.freeze({
  SCOPE_INVALID: 'SCOPE_INVALID',
  SCOPE_UNRESOLVED: 'SCOPE_UNRESOLVED',
});

/**
 * Normalizes a scope string, mapping 'root' to 'repo:root'.
 */
export function normalizeScopeKey(scope: string): string {
  if (!scope || typeof scope !== 'string') {
    throw new Error(`${ScopeResolverErrorCode.SCOPE_INVALID}: scope must be a non-empty string`);
  }
  const trimmed = scope.trim();
  if (!trimmed) {
    throw new Error(`${ScopeResolverErrorCode.SCOPE_INVALID}: scope cannot be whitespace-only`);
  }
  if (trimmed === 'root') return 'repo:root';
  return trimmed;
}

/**
 * Resolves a repository scope string to its canonical repository UUID and sourceAuthorityRepoId.
 * Queries atlas_graphify_scope_repository_map_v1 joined to atlas_repository_identity.
 * Falls back to atlas_repository_identity directly if the query is an authority key (e.g. 'deeds-web-app').
 */
export async function resolveRepositoryScopeV1(
  scope: string,
  dbClient: DbClient,
): Promise<ResolvedRepositoryScopeV1> {
  const normalized = normalizeScopeKey(scope);

  // 1. Check atlas_graphify_scope_repository_map_v1 joined to atlas_repository_identity
  const mapResult = await dbClient.query<{
    repository_id: string;
    source_authority_repo_id: string;
    membership_repository_scope: string;
  }>(
    `SELECT m.repository_id, m.source_authority_repo_id, m.membership_repository_scope
     FROM atlas_graphify_scope_repository_map_v1 m
     JOIN atlas_repository_identity ri ON ri.repository_id = m.repository_id
     WHERE m.membership_repository_scope = $1
     LIMIT 1`,
    [normalized],
  );

  if (mapResult.rows[0]) {
    const row = mapResult.rows[0];
    return {
      repositoryId: row.repository_id,
      sourceAuthorityRepoId: row.source_authority_repo_id,
      membershipScope: row.membership_repository_scope,
    };
  }

  // 2. Fallback check by source_authority_repo_id directly on atlas_repository_identity
  // (e.g. if the caller passes the repo_id 'deeds-web-app')
  const repoIdKey = normalized.startsWith('repo:') ? normalized.slice(5) : normalized;
  const directResult = await dbClient.query<{
    repository_id: string;
    source_authority_repo_id: string;
  }>(
    `SELECT repository_id, source_authority_repo_id
     FROM atlas_repository_identity
     WHERE source_authority_repo_id = $1
     LIMIT 1`,
    [repoIdKey],
  );

  if (directResult.rows[0]) {
    const row = directResult.rows[0];
    return {
      repositoryId: row.repository_id,
      sourceAuthorityRepoId: row.source_authority_repo_id,
      membershipScope: normalized,
    };
  }

  throw new Error(`${ScopeResolverErrorCode.SCOPE_UNRESOLVED}: "${scope}" does not join against atlas_repository_identity`);
}
