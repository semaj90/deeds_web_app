import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { ENV } from '$lib/server/env.server.js';
import {
	bindPgCandidateIdentityV1,
	readScratchPgCandidateIdentityV1,
	type PgCandidateIdentityRowV1,
	type ReadonlyPgQueryClientV1
} from './nes-fsm-postgres-candidate-identity-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const lineageBindingChecksum = `sha256:${'c'.repeat(64)}`;
const scratchIntegrationEnabled = process.env['ATLAS_NES_FSM_PG_IDENTITY_SCRATCH_TEST'] === '1';
const rows: PgCandidateIdentityRowV1[] = [
	{
		id: '00000000-0000-4000-8000-000000000002',
		source_ref: 'src/b.ts',
		source_revision: sourceRevision,
		workspace_revision: workspaceRevision,
		lineage_binding_checksum: lineageBindingChecksum
	},
	{
		id: '00000000-0000-4000-8000-000000000001',
		source_ref: 'src/a.ts',
		source_revision: sourceRevision,
		workspace_revision: workspaceRevision,
		lineage_binding_checksum: lineageBindingChecksum
	}
];

describe('bindPgCandidateIdentityV1', () => {
	it('assigns stable contiguous uint16 ordinals independent of database row order', () => {
		const forward = bindPgCandidateIdentityV1(rows, workspaceRevision);
		const reversed = bindPgCandidateIdentityV1([...rows].reverse(), workspaceRevision);
		expect(forward.status).toBe('BOUND_READ_ONLY');
		if (forward.status !== 'BOUND_READ_ONLY' || reversed.status !== 'BOUND_READ_ONLY') throw new Error('expected bound maps');
		expect(forward.candidateMap.map((entry) => entry.candidateOrdinal)).toEqual([0, 1]);
		expect(forward.candidateMap.map((entry) => entry.rowId)).toEqual([
			'00000000-0000-4000-8000-000000000001',
			'00000000-0000-4000-8000-000000000002'
		]);
		expect(forward.candidateOrdinalMapChecksum).toBe(reversed.candidateOrdinalMapChecksum);
		expect(forward).toMatchObject({ canonicalAuthority: false, promotionEligible: false, writesPerformed: false });
	});

	it('returns an explicit blocked receipt for an empty database result', () => {
		expect(bindPgCandidateIdentityV1([], workspaceRevision)).toMatchObject({
			status: 'BLOCKED_EMPTY_CANDIDATE_SET',
			candidateMap: [],
			writesPerformed: false
		});
	});

	it('rejects missing and non-SHA source revisions', () => {
		expect(() => bindPgCandidateIdentityV1([{ ...rows[0]!, source_revision: null }], workspaceRevision))
			.toThrow('NES_FSM_PG_IDENTITY_MISSING_OR_INVALID_SOURCE_REVISION');
		expect(() => bindPgCandidateIdentityV1([{ ...rows[0]!, source_revision: 'git:main' }], workspaceRevision))
			.toThrow('NES_FSM_PG_IDENTITY_MISSING_OR_INVALID_SOURCE_REVISION');
	});

	it('rejects workspace drift, duplicate row identity, and invalid lineage checksums', () => {
		expect(() => bindPgCandidateIdentityV1([{ ...rows[0]!, workspace_revision: `sha256:${'d'.repeat(64)}` }], workspaceRevision))
			.toThrow('NES_FSM_PG_IDENTITY_WORKSPACE_REVISION_MISMATCH');
		expect(() => bindPgCandidateIdentityV1([rows[0]!, rows[0]!], workspaceRevision))
			.toThrow('NES_FSM_PG_IDENTITY_INVALID_OR_DUPLICATE_ROW_ID');
		expect(() => bindPgCandidateIdentityV1([{ ...rows[0]!, lineage_binding_checksum: null }], workspaceRevision))
			.toThrow('NES_FSM_PG_IDENTITY_MISSING_OR_INVALID_LINEAGE_CHECKSUM');
	});

	it('rejects an invalid workspace revision before binding', () => {
		expect(() => bindPgCandidateIdentityV1(rows, 'fixture:workspace'))
			.toThrow('NES_FSM_PG_IDENTITY_INVALID_WORKSPACE_REVISION');
	});

	it('reads only from a read-only PG18 scratch transaction and emits an empty-set blocker', async () => {
		const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
		const client: ReadonlyPgQueryClientV1 = {
			async query<Row>(text: string, values?: readonly unknown[]) {
				calls.push({ text, values });
				if (calls.length === 1) {
					return {
						rows: [{
							database_name: 'legal_ai_live_integration_scratch',
							server_version: '18.4',
							transaction_read_only: 'on'
						}] as Row[]
					};
				}
				return { rows: [] as Row[] };
			}
		};
		const result = await readScratchPgCandidateIdentityV1(client, workspaceRevision);
		expect(result.status).toBe('BLOCKED_EMPTY_CANDIDATE_SET');
		expect(calls).toHaveLength(2);
		expect(calls[1]?.text).toContain('FROM public.codebase_chunk_index');
		expect(calls[1]?.text).toContain('ORDER BY id::text ASC');
		expect(calls[1]?.values).toEqual([workspaceRevision, 65_537]);
	});

	it('fails closed before reading candidates when the database or transaction is not scratch/read-only', async () => {
		const client: ReadonlyPgQueryClientV1 = {
			async query<Row>() {
				return {
					rows: [{
						database_name: 'legal_ai_db',
						server_version: '18.4',
						transaction_read_only: 'on'
					}] as Row[]
				};
			}
		};
		await expect(readScratchPgCandidateIdentityV1(client, workspaceRevision))
			.rejects.toThrow('NES_FSM_PG_IDENTITY_SCRATCH_DATABASE_REQUIRED');
	});
});

describe.skipIf(!scratchIntegrationEnabled)('PG18 candidate identity scratch readback', () => {
	it('reads the named scratch database in a read-only transaction and reports the real gate state', async () => {
		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || connectionUrl.port !== '5434') {
			throw new Error('NES_FSM_PG_IDENTITY_LOCAL_PG18_REQUIRED');
		}
		connectionUrl.pathname = '/legal_ai_live_integration_scratch';
		const client = new Client({ connectionString: connectionUrl.toString() });
		await client.connect();
		try {
			await client.query('BEGIN READ ONLY');
			const result = await readScratchPgCandidateIdentityV1(client, workspaceRevision);
			expect(result).toMatchObject({
				schema: 'atlas.nes-fsm-postgres-candidate-identity.v1',
				scope: 'SCRATCH_FIXTURE_ONLY',
				canonicalAuthority: false,
				promotionEligible: false,
				writesPerformed: false
			});
			// Empty scratch rows are an honest blocked gate, not a passing live-candidate proof.
			expect(result.status).toBe('BLOCKED_EMPTY_CANDIDATE_SET');
			await client.query('ROLLBACK');
		} finally {
			await client.end();
		}
	});
});
