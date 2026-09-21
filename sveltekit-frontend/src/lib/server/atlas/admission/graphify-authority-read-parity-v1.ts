/**
 * Shadow-mode read parity between the legacy `graphify_executions.canonical_authority` boolean and the new owner
 * `graphify_execution_authority`. READ-ONLY: SELECTs only, nothing is written, no reader is switched over.
 * The boolean stays the live reader until this reports PARITY_PROVEN across a read-parity period.
 */
export interface AuthorityRow { workspace_id: string; workspace_revision: string; execution_id: string }

export type RevisionParity = 'MATCH' | 'MISMATCH' | 'BOOLEAN_ONLY' | 'AUTHORITY_ONLY' | 'BOOLEAN_CONFLICT';

export interface AuthorityReadParityV1 {
  schema: 'atlas.graphify-authority-read-parity.v1';
  status: 'PARITY_PROVEN' | 'PARITY_NOT_PROVEN';
  reasons: string[];
  counts: Record<RevisionParity, number>;
  revisions: Array<{ workspaceId: string; workspaceRevision: string; parity: RevisionParity; booleanExecutionIds: string[]; authorityExecutionId: string | null }>;
  writesPerformed: false;
}

const key = (r: AuthorityRow) => `${r.workspace_id}\u0000${r.workspace_revision}`;

/** Pure comparison. `booleanRows` = executions with canonical_authority IS TRUE; `authorityRows` = graphify_execution_authority rows. */
export function compareAuthorityReadParityV1(booleanRows: AuthorityRow[], authorityRows: AuthorityRow[]): AuthorityReadParityV1 {
  const byBoolean = new Map<string, AuthorityRow[]>();
  for (const r of booleanRows) byBoolean.set(key(r), [...(byBoolean.get(key(r)) ?? []), r]);
  const byAuthority = new Map<string, AuthorityRow>();
  for (const r of authorityRows) byAuthority.set(key(r), r);

  const counts: Record<RevisionParity, number> = { MATCH: 0, MISMATCH: 0, BOOLEAN_ONLY: 0, AUTHORITY_ONLY: 0, BOOLEAN_CONFLICT: 0 };
  const revisions: AuthorityReadParityV1['revisions'] = [];
  for (const k of new Set([...byBoolean.keys(), ...byAuthority.keys()])) {
    const b = byBoolean.get(k) ?? [];
    const a = byAuthority.get(k) ?? null;
    const sample = b[0] ?? a!;
    let parity: RevisionParity;
    if (b.length > 1) parity = 'BOOLEAN_CONFLICT';
    else if (b.length === 1 && a) parity = b[0].execution_id === a.execution_id ? 'MATCH' : 'MISMATCH';
    else if (b.length === 1) parity = 'BOOLEAN_ONLY';
    else parity = 'AUTHORITY_ONLY';
    counts[parity] += 1;
    revisions.push({ workspaceId: sample.workspace_id, workspaceRevision: sample.workspace_revision, parity, booleanExecutionIds: b.map((x) => x.execution_id), authorityExecutionId: a?.execution_id ?? null });
  }

  const reasons: string[] = [];
  if (counts.MATCH === 0) reasons.push('NO_MATCHING_REVISION');
  for (const p of ['MISMATCH', 'BOOLEAN_ONLY', 'AUTHORITY_ONLY', 'BOOLEAN_CONFLICT'] as const) if (counts[p] > 0) reasons.push(`${p}:${counts[p]}`);
  return { schema: 'atlas.graphify-authority-read-parity.v1', status: reasons.length === 0 ? 'PARITY_PROVEN' : 'PARITY_NOT_PROVEN', reasons, counts, revisions, writesPerformed: false };
}

/** Minimal read-only query surface so callers pass their own pool/client. */
export interface ReadOnlyQuery { query(sql: string): Promise<{ rows: AuthorityRow[] }> }

export async function loadAuthorityReadParityV1(db: ReadOnlyQuery): Promise<AuthorityReadParityV1> {
  const booleanRows = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id FROM public.graphify_executions WHERE canonical_authority IS TRUE`,
  )).rows;
  const authorityRows = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id FROM public.graphify_execution_authority`,
  )).rows;
  return compareAuthorityReadParityV1(booleanRows, authorityRows);
}
