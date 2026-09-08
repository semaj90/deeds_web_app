import { describe, expect, it } from 'vitest';

import {
	LEXICAL_PASS_FAMILY_V1,
	LEXICAL_PASS_NAME_V1,
	LEXICAL_PASS_PRODUCER_ID_V1,
	LexicalPassLedgerAdapterInputV1Schema,
	buildLexicalPassLedgerInputV1,
	buildLexicalPassLedgerRowV1,
	proveLexicalPassAdmissionV1,
} from './lexical-pass-ledger-adapter-v1.js';
import { runLexicalFeatureRegistryV1 } from './lexical-feature-registry-v1.js';
import { resolveExecutionSemantics } from '../db/schema/analysis-pass-results.js';

const result = runLexicalFeatureRegistryV1({
	packetKey: 'packet:abc123',
	sourceRef: 'src/lib/server/auth.ts',
	sourceRevision: 'sha256:source-1',
	workspaceRevision: 'workspace-1',
	language: 'typescript',
	content: 'export function validateSession() { return sessionToken; }',
});

const input = {
	analysisJobId: 'job:lexical-1',
	evidenceId: 'evidence:lexical-1',
	passRevision: 'lexical-pass-v1',
	startedAt: '2026-09-07T00:00:00.000Z',
	completedAt: '2026-09-07T00:00:01.000Z',
	result,
};

describe('Lexical pass ledger adapter V1', () => {
	it('constructs a fully revision-qualified ledger input without writing', () => {
		const ledgerInput = buildLexicalPassLedgerInputV1(input);

		expect(ledgerInput).toMatchObject({
			analysisJobId: input.analysisJobId,
			evidenceId: input.evidenceId,
			packetKey: result.packetKey,
			sourceRef: result.sourceRef,
			sourceRevision: result.sourceRevision,
			workspaceRevision: result.workspaceRevision,
			family: LEXICAL_PASS_FAMILY_V1,
			passName: LEXICAL_PASS_NAME_V1,
			passRevision: input.passRevision,
			producerId: LEXICAL_PASS_PRODUCER_ID_V1,
			status: 'succeeded',
		});
		expect(ledgerInput.payload).toEqual({ lexicalFeatureRegistry: result });
		expect(ledgerInput.inputHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('normalizes the same adapter into the existing pass row shape', () => {
		const row = buildLexicalPassLedgerRowV1(input);

		expect(row.packetKey).toBe(result.packetKey);
		expect(row.sourceRevision).toBe(result.sourceRevision);
		expect(row.passRevision).toBe(input.passRevision);
		expect(row.passIdentityHash).toMatch(/^[a-f0-9]{64}$/);
		expect(row.output).toEqual({ lexicalFeatureRegistry: result });
		expect(row.provenance).toMatchObject({
		workspaceRevision: result.workspaceRevision,
		producerRevision: result.extractorRevision,
	});
	});

	it('fails closed when the pure result has no packet identity', () => {
		const withoutPacket = {
			...input,
			result: { ...result, packetKey: null },
		};

		expect(() => buildLexicalPassLedgerInputV1(withoutPacket)).toThrow(
			'LEXICAL_PASS_PACKET_KEY_REQUIRED',
		);
	});

	it('rejects missing pass identity and malformed timestamps', () => {
		expect(() =>
			LexicalPassLedgerAdapterInputV1Schema.parse({
				...input,
				passRevision: '',
			}),
		).toThrow();
		expect(() =>
			LexicalPassLedgerAdapterInputV1Schema.parse({
				...input,
				startedAt: 'not-a-timestamp',
			}),
		).toThrow();
	});

	it('proves deterministic adapter replay without a database write', () => {
		const proof = proveLexicalPassAdmissionV1(input);

		expect(proof).toMatchObject({
			status: 'READY_FOR_LIVE_ADMISSION',
			packetKey: result.packetKey,
			sourceRevision: result.sourceRevision,
			workspaceRevision: result.workspaceRevision,
			passRevision: input.passRevision,
			deterministicReplay: true,
			databaseWritePerformed: false,
			workerRegistered: false,
		});
	});

	it('registers lexical passes as deterministic for future logical reuse', () => {
		expect(resolveExecutionSemantics(LEXICAL_PASS_NAME_V1)).toBe('deterministic_idempotent');
	});

	it('rejects tampering and whitespace identities before ledger construction', () => {
		expect(() => buildLexicalPassLedgerInputV1({ ...input,
			result: { ...result, normalizedTerms: ['forged'] } })).toThrow('CHECKSUM_MISMATCH');
		expect(() => buildLexicalPassLedgerInputV1({ ...input, passRevision: ' ' })).toThrow('INVALID_IDENTITY');
	});

	it('invalidates logical reuse across workspace revisions but preserves it across jobs', () => {
		const next = runLexicalFeatureRegistryV1({ packetKey: result.packetKey!, sourceRef: result.sourceRef,
			sourceRevision: result.sourceRevision, workspaceRevision: 'workspace-2', language: 'typescript',
			content: 'export function validateSession() { return sessionToken; }' });
		const first = buildLexicalPassLedgerRowV1(input);
		expect(buildLexicalPassLedgerRowV1({ ...input, result: next }).passIdentityHash).not.toBe(first.passIdentityHash);
		expect(buildLexicalPassLedgerRowV1({ ...input, analysisJobId: 'another-job' }).passIdentityHash).toBe(first.passIdentityHash);
	});
});
