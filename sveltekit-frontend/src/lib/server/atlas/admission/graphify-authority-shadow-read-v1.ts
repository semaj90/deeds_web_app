/**
 * Shared shadow-selection helper for readers of Graphify canonical-execution authority (cutover step 2).
 * The authority table result is OBSERVED only. The legacy `canonical_authority` selection stays the runtime owner:
 * `runtimeSelection` is ALWAYS the legacy execution id (or null), never the authority id, so wiring this into a reader cannot change
 * that reader's behavior. Disagreement is reported, never silently resolved. Ambiguity (several legacy or several authority rows)
 * fails closed: no id is picked arbitrarily. READ-ONLY: SELECTs only.
 */
import { compareAuthorityReadParityV1, type AuthorityRow, type ParityState } from './graphify-authority-read-parity-v1';

export interface AuthorityShadowObservationV1 {
  schema: 'atlas.graphify-authority-shadow-observation.v1';
  workspaceId: string;
  workspaceRevision: string;
  /** Present only when exactly one legacy canonical row exists for the scope. */
  legacyExecutionId: string | null;
  /** Present only when exactly one authority row exists for the scope. */
  authorityExecutionId: string | null;
  authorityState: string | null;
  parityStatus: ParityState;
  readParityProven: boolean;
  /** Always equals legacyExecutionId. The authority table never drives runtime behavior in this phase. */
  runtimeSelection: string | null;
  runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY';
  shadowAuthorityObserved: true;
  mutationAuthorized: false;
}

export type ShadowAuthorityRow = AuthorityRow & { authority_state?: string };
export interface ShadowScope { workspaceId: string; workspaceRevision: string }

const inScope = (row: AuthorityRow, scope: ShadowScope) => row.workspace_id === scope.workspaceId && row.workspace_revision === scope.workspaceRevision;

/** Pure: observe one (workspace, revision) scope from already-read rows. */
export function observeAuthorityShadowV1(legacyRows: AuthorityRow[], authorityRows: ShadowAuthorityRow[], scope: ShadowScope): AuthorityShadowObservationV1 {
  const legacy = legacyRows.filter((row) => inScope(row, scope));
  const authority = authorityRows.filter((row) => inScope(row, scope));
  const parity = compareAuthorityReadParityV1(legacy, authority);
  const legacyExecutionId = legacy.length === 1 ? legacy[0].execution_id : null;
  return {
    schema: 'atlas.graphify-authority-shadow-observation.v1',
    workspaceId: scope.workspaceId,
    workspaceRevision: scope.workspaceRevision,
    legacyExecutionId,
    authorityExecutionId: authority.length === 1 ? authority[0].execution_id : null,
    authorityState: authority.length === 1 ? (authority[0].authority_state ?? null) : null,
    parityStatus: parity.status,
    readParityProven: parity.readParityProven,
    runtimeSelection: legacyExecutionId,
    runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY',
    shadowAuthorityObserved: true,
    mutationAuthorized: false,
  };
}

export interface ShadowReadQuery { query(sql: string, params?: unknown[]): Promise<{ rows: ShadowAuthorityRow[] }> }

/** Reads both systems independently for one scope (SELECTs only). */
export async function loadAuthorityShadowV1(db: ShadowReadQuery, scope: ShadowScope): Promise<AuthorityShadowObservationV1> {
  const params = [scope.workspaceId, scope.workspaceRevision];
  const legacy = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id FROM public.graphify_executions
      WHERE canonical_authority IS TRUE AND workspace_id = $1::uuid AND workspace_revision = $2`, params,
  )).rows;
  const authority = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id, authority_state FROM public.graphify_execution_authority
      WHERE workspace_id = $1::uuid AND workspace_revision = $2`, params,
  )).rows;
  return observeAuthorityShadowV1(legacy, authority, scope);
}
