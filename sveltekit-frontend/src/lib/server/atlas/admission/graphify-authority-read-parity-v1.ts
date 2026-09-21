/**
 * Shadow-mode read parity between the legacy `graphify_executions.canonical_authority` boolean and the new owner
 * `graphify_execution_authority`. READ-ONLY: SELECTs only, nothing is written, no reader is switched over.
 * The legacy boolean stays the runtime owner until this reports PARITY_PROVEN across a read-parity period.
 * A missing authority row is NEVER synthesized from the legacy boolean here.
 */
export interface AuthorityRow { workspace_id: string; workspace_revision: string; execution_id: string }

export type ParityState =
  | 'PARITY_PROVEN'
  | 'LEGACY_PRESENT_AUTHORITY_MISSING'
  | 'AUTHORITY_PRESENT_LEGACY_MISSING'
  | 'SELECTION_MISMATCH'
  | 'MULTIPLE_LEGACY_CANONICAL_ROWS'
  | 'MULTIPLE_AUTHORITY_ROWS'
  | 'NO_SELECTION';

export interface AuthorityReadParityV1 {
  schema: 'atlas.graphify-authority-read-parity.v1';
  /** Overall: PARITY_PROVEN only if every revision is PARITY_PROVEN (and at least one exists); NO_SELECTION if there is nothing to compare; else the most severe revision state. */
  status: ParityState;
  readParityProven: boolean;
  counts: Record<ParityState, number>;
  revisions: Array<{ workspaceId: string; workspaceRevision: string; state: ParityState; legacyExecutionIds: string[]; authorityExecutionIds: string[] }>;
  runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY';
  mutationAuthorized: false;
  writesPerformed: false;
}

const key = (r: AuthorityRow) => `${r.workspace_id}\u0000${r.workspace_revision}`;
const group = (rows: AuthorityRow[]) => {
  const m = new Map<string, AuthorityRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};

/** Most severe first; used to pick the overall status when revisions disagree. */
const SEVERITY: ParityState[] = [
  'MULTIPLE_LEGACY_CANONICAL_ROWS', 'MULTIPLE_AUTHORITY_ROWS', 'SELECTION_MISMATCH',
  'AUTHORITY_PRESENT_LEGACY_MISSING', 'LEGACY_PRESENT_AUTHORITY_MISSING', 'NO_SELECTION', 'PARITY_PROVEN',
];

/** Pure comparison. `legacyRows` = executions with canonical_authority IS TRUE; `authorityRows` = graphify_execution_authority rows. */
export function compareAuthorityReadParityV1(legacyRows: AuthorityRow[], authorityRows: AuthorityRow[]): AuthorityReadParityV1 {
  const legacy = group(legacyRows);
  const authority = group(authorityRows);
  const counts = Object.fromEntries(SEVERITY.map((s) => [s, 0])) as Record<ParityState, number>;
  const revisions: AuthorityReadParityV1['revisions'] = [];

  for (const k of new Set([...legacy.keys(), ...authority.keys()])) {
    const l = legacy.get(k) ?? [];
    const a = authority.get(k) ?? [];
    const sample = (l[0] ?? a[0])!;
    let state: ParityState;
    if (l.length > 1) state = 'MULTIPLE_LEGACY_CANONICAL_ROWS';
    else if (a.length > 1) state = 'MULTIPLE_AUTHORITY_ROWS';
    else if (l.length === 1 && a.length === 1) state = l[0].execution_id === a[0].execution_id ? 'PARITY_PROVEN' : 'SELECTION_MISMATCH';
    else if (l.length === 1) state = 'LEGACY_PRESENT_AUTHORITY_MISSING';
    else state = 'AUTHORITY_PRESENT_LEGACY_MISSING';
    counts[state] += 1;
    revisions.push({ workspaceId: sample.workspace_id, workspaceRevision: sample.workspace_revision, state, legacyExecutionIds: l.map((x) => x.execution_id), authorityExecutionIds: a.map((x) => x.execution_id) });
  }

  let status: ParityState;
  if (revisions.length === 0) { status = 'NO_SELECTION'; counts.NO_SELECTION = 1; }
  else status = SEVERITY.find((s) => s !== 'PARITY_PROVEN' && counts[s] > 0) ?? 'PARITY_PROVEN';
  return {
    schema: 'atlas.graphify-authority-read-parity.v1', status, readParityProven: status === 'PARITY_PROVEN', counts, revisions,
    runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', mutationAuthorized: false, writesPerformed: false,
  };
}

/** Minimal read-only query surface so callers pass their own pool/client. */
export interface ReadOnlyQuery { query(sql: string): Promise<{ rows: AuthorityRow[] }> }

export async function loadAuthorityReadParityV1(db: ReadOnlyQuery): Promise<AuthorityReadParityV1> {
  const legacyRows = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id FROM public.graphify_executions WHERE canonical_authority IS TRUE`,
  )).rows;
  const authorityRows = (await db.query(
    `SELECT workspace_id::text AS workspace_id, workspace_revision, execution_id::text AS execution_id FROM public.graphify_execution_authority`,
  )).rows;
  return compareAuthorityReadParityV1(legacyRows, authorityRows);
}
