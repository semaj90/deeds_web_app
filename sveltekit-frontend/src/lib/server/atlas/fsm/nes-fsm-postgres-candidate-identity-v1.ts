import { createHash } from 'node:crypto';

export const NES_FSM_PG_CANDIDATE_IDENTITY_SCHEMA_V1 =
	'atlas.nes-fsm-postgres-candidate-identity.v1' as const;
export const NES_FSM_PG_CANDIDATE_IDENTITY_MAX_ROWS_V1 = 65_536;

const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal projection of canonical PostgreSQL identity and revision columns. */
export interface PgCandidateIdentityRowV1 {
	readonly id: string;
	readonly source_ref: string | null;
	readonly source_revision: string | null;
	readonly workspace_revision: string | null;
	readonly lineage_binding_checksum: string | null;
}

export interface ReadonlyPgQueryResultV1<Row> {
	readonly rows: readonly Row[];
}

export interface ReadonlyPgQueryClientV1 {
	query<Row = Record<string, unknown>>(
		text: string,
		values?: unknown[]
	): Promise<ReadonlyPgQueryResultV1<Row>>;
}

export interface PgCandidateIdentityEntryV1 {
	readonly sourceIndex: number;
	readonly candidateOrdinal: number;
	readonly rowId: string;
	readonly sourceRef: string;
	readonly sourceRevision: string;
	readonly workspaceRevision: string;
	readonly lineageBindingChecksum: string;
}

export type PgCandidateIdentityBindingV1 =
	| {
			readonly schema: typeof NES_FSM_PG_CANDIDATE_IDENTITY_SCHEMA_V1;
			readonly status: 'BOUND_READ_ONLY';
			readonly scope: 'SCRATCH_FIXTURE_ONLY';
			readonly workspaceRevision: string;
			readonly candidateSnapshotRevision: string;
			readonly candidateOrdinalMapChecksum: string;
			readonly candidateMap: readonly PgCandidateIdentityEntryV1[];
			readonly canonicalAuthority: false;
			readonly promotionEligible: false;
			readonly writesPerformed: false;
	  }
	| {
			readonly schema: typeof NES_FSM_PG_CANDIDATE_IDENTITY_SCHEMA_V1;
			readonly status: 'BLOCKED_EMPTY_CANDIDATE_SET';
			readonly scope: 'SCRATCH_FIXTURE_ONLY';
			readonly workspaceRevision: string;
			readonly candidateMap: readonly [];
			readonly canonicalAuthority: false;
			readonly promotionEligible: false;
			readonly writesPerformed: false;
	  };

function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Reads one bounded, revision-filtered candidate set from a verified local PG18 scratch DB.
 * The caller must start a READ ONLY transaction; this function verifies that boundary.
 */
export async function readScratchPgCandidateIdentityV1(
	client: ReadonlyPgQueryClientV1,
	expectedWorkspaceRevision: string
): Promise<PgCandidateIdentityBindingV1> {
	if (!SHA256_REVISION.test(expectedWorkspaceRevision)) {
		throw new Error('NES_FSM_PG_IDENTITY_INVALID_WORKSPACE_REVISION');
	}
	const identity = await client.query<{
		database_name: string;
		server_version: string;
		transaction_read_only: string;
	}>(`SELECT current_database() AS database_name,
				current_setting('server_version') AS server_version,
				current_setting('transaction_read_only') AS transaction_read_only`);
	const db = identity.rows[0];
	if (db?.database_name !== 'legal_ai_live_integration_scratch') {
		throw new Error('NES_FSM_PG_IDENTITY_SCRATCH_DATABASE_REQUIRED');
	}
	if (!db.server_version.startsWith('18.')) {
		throw new Error('NES_FSM_PG_IDENTITY_POSTGRES_18_REQUIRED');
	}
	if (db.transaction_read_only !== 'on') {
		throw new Error('NES_FSM_PG_IDENTITY_READ_ONLY_TRANSACTION_REQUIRED');
	}
	const selected = await client.query<PgCandidateIdentityRowV1>(
		`SELECT id::text AS id,
				source_ref,
				source_revision,
				workspace_revision,
				lineage_binding_checksum
			FROM public.codebase_chunk_index
			WHERE workspace_revision = $1
			ORDER BY id::text ASC
			LIMIT $2`,
		[expectedWorkspaceRevision, NES_FSM_PG_CANDIDATE_IDENTITY_MAX_ROWS_V1 + 1]
	);
	return bindPgCandidateIdentityV1(selected.rows, expectedWorkspaceRevision);
}

/**
 * Binds live-shaped codebase_chunk_index rows to deterministic local ordinals.
 * The result is intentionally non-canonical and cannot be used to authorize dispatch.
 */
export function bindPgCandidateIdentityV1(
	rows: readonly PgCandidateIdentityRowV1[],
	expectedWorkspaceRevision: string
): PgCandidateIdentityBindingV1 {
	if (!SHA256_REVISION.test(expectedWorkspaceRevision)) {
		throw new Error('NES_FSM_PG_IDENTITY_INVALID_WORKSPACE_REVISION');
	}
	if (rows.length === 0) {
		return {
			schema: NES_FSM_PG_CANDIDATE_IDENTITY_SCHEMA_V1,
			status: 'BLOCKED_EMPTY_CANDIDATE_SET',
			scope: 'SCRATCH_FIXTURE_ONLY',
			workspaceRevision: expectedWorkspaceRevision,
			candidateMap: [],
			canonicalAuthority: false,
			promotionEligible: false,
			writesPerformed: false
		};
	}
	if (rows.length > NES_FSM_PG_CANDIDATE_IDENTITY_MAX_ROWS_V1) {
		throw new RangeError('NES_FSM_PG_IDENTITY_ROW_LIMIT_EXCEEDED');
	}

	const seenIds = new Set<string>();
	const normalized = rows.map((row) => {
		const id = row.id.toLowerCase();
		if (!UUID.test(id) || seenIds.has(id)) {
			throw new Error('NES_FSM_PG_IDENTITY_INVALID_OR_DUPLICATE_ROW_ID');
		}
		seenIds.add(id);
		if (typeof row.source_ref !== 'string' || row.source_ref.trim().length === 0) {
			throw new Error('NES_FSM_PG_IDENTITY_MISSING_SOURCE_REF');
		}
		if (!row.source_revision || !SHA256_REVISION.test(row.source_revision)) {
			throw new Error('NES_FSM_PG_IDENTITY_MISSING_OR_INVALID_SOURCE_REVISION');
		}
		if (row.workspace_revision !== expectedWorkspaceRevision) {
			throw new Error('NES_FSM_PG_IDENTITY_WORKSPACE_REVISION_MISMATCH');
		}
		if (!row.lineage_binding_checksum || !SHA256_REVISION.test(row.lineage_binding_checksum)) {
			throw new Error('NES_FSM_PG_IDENTITY_MISSING_OR_INVALID_LINEAGE_CHECKSUM');
		}
		return {
			id,
			sourceRef: row.source_ref,
			sourceRevision: row.source_revision,
			workspaceRevision: row.workspace_revision,
			lineageBindingChecksum: row.lineage_binding_checksum
		};
	});

	// UUID text order is a stable, locale-independent tiebreaker for repeatable maps.
	normalized.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const candidateMap = normalized.map((row, sourceIndex) => ({
		sourceIndex,
		candidateOrdinal: sourceIndex,
		rowId: row.id,
		sourceRef: row.sourceRef,
		sourceRevision: row.sourceRevision,
		workspaceRevision: row.workspaceRevision,
		lineageBindingChecksum: row.lineageBindingChecksum
	}));
	const canonicalMap = candidateMap
		.map((entry) => [
			entry.sourceIndex,
			entry.candidateOrdinal,
			entry.rowId,
			entry.sourceRef,
			entry.sourceRevision,
			entry.workspaceRevision,
			entry.lineageBindingChecksum
		].join('|') + '\n')
		.join('');
	const candidateOrdinalMapChecksum = sha256Hex(canonicalMap);

	return {
		schema: NES_FSM_PG_CANDIDATE_IDENTITY_SCHEMA_V1,
		status: 'BOUND_READ_ONLY',
		scope: 'SCRATCH_FIXTURE_ONLY',
		workspaceRevision: expectedWorkspaceRevision,
		candidateSnapshotRevision: `sha256:${sha256Hex(`${expectedWorkspaceRevision}\n${canonicalMap}`)}`,
		candidateOrdinalMapChecksum,
		candidateMap,
		canonicalAuthority: false,
		promotionEligible: false,
		writesPerformed: false
	};
}
