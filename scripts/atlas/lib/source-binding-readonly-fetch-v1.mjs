/**
 * Read-only, request-scoped fetch for the already-owned
 * public.atlas_workspace_source_bindings table.
 *
 * The caller injects a dedicated pg Client/PoolClient (NOT a shared pool query facade).
 * Always returns raw rows for the existing pure source-binding-resolver-v1.mjs.
 * Never authorizes projection, never creates a source-version receipt.
 */
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MAX_BATCH = 20;
const SAFE_REF = /^[^\0\r\n]+$/;
export const SOURCE_BINDING_READONLY_SQL_V1 = `
SELECT repo_id, workspace_revision, canonical_source_ref, source_revision,
       content_digest, binding_checksum, byte_length, producer_revision
  FROM public.atlas_workspace_source_bindings
 WHERE workspace_revision = $1
   AND canonical_source_ref = $2
 ORDER BY repo_id
 LIMIT 2`;

export function assertSourceBindingScopeV1(input) {
  if (!input || !SHA256.test(input.workspaceRevision ?? '')) throw new Error('SOURCE_BINDING_WORKSPACE_REVISION_REQUIRED');
  const ref = input.sourceRef;
  if (typeof ref !== 'string' || !ref.trim() || !SAFE_REF.test(ref)
    || ref.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ref)
    || ref.replaceAll('\\', '/').split('/').includes('..')
    || /^(?:\$lib|\$app|@|~)[\\/]/.test(ref)) {
    throw new Error('SOURCE_BINDING_CANONICAL_SOURCE_REF_REQUIRED');
  }
  return {workspaceRevision: input.workspaceRevision, sourceRef: ref};
}

/**
 * Fetches within its own read-only transaction. Returns [] for zero matches and
 * preserves 2 rows for ambiguity detection by the pure resolver. Caller must not
 * use the connection concurrently. A separate verified packet identity is required.
 */
export async function fetchSourceBindingRowsReadOnlyV1(client, input) {
  if (!client || typeof client.query !== 'function') throw new Error('SOURCE_BINDING_PG_CLIENT_REQUIRED');
  const scope = assertSourceBindingScopeV1(input);
  let begun = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const result = await client.query(SOURCE_BINDING_READONLY_SQL_V1, [scope.workspaceRevision, scope.sourceRef]);
    if (!result || !Array.isArray(result.rows) || result.rows.length > 2) throw new Error('SOURCE_BINDING_INVALID_QUERY_RESULT');
    return result.rows;
  } finally {
    // ROLLBACK is safe for successful read-only work and failed transactions.
    if (begun) await client.query('ROLLBACK');
  }
}

/**
 * Bounded helper: one client/transaction per scope, no writes. For an independent
 * application-level snapshot, wrap an explicitly managed caller transaction instead.
 */
export async function fetchSourceBindingRowsForScopesV1(connect, scopes) {
  if (typeof connect !== 'function' || !Array.isArray(scopes) || scopes.length > MAX_BATCH)
    throw new Error('SOURCE_BINDING_BOUNDED_FETCH_REQUIRED');
  const results = [];
  for (const scope of scopes) {
    assertSourceBindingScopeV1(scope);
    const client = await connect();
    try { results.push(await fetchSourceBindingRowsReadOnlyV1(client, scope)); }
    finally { client.release?.(); }
  }
  return results;
}
