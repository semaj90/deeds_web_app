// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { executeLexicalPassV1, type LexicalPassDependenciesV1 } from './lexical-pass-executor-v1.js';
import { normalizeAnalysisPassLedgerInput, type AnalysisPassResultRow } from '../db/schema/analysis-pass-results.js';
import { sha256Hex } from './stable-hash.js';
import { coercePersistedPayloadEnvelope } from '../../types/protocol.js';

const text = 'const sessionToken = "session expired";';
const digest = sha256Hex(text);
const job = { id: 'job-1', evidenceId: 'evidence-1', metadata: {
	packetKey: 'alias:auth', sourceRef: 'src/auth.ts', sourceRevision: `sha256:${digest}`,
	workspaceRevision: '42', text,
} };

function fixture() {
	const rows: AnalysisPassResultRow[] = [];
	const deps: LexicalPassDependenciesV1 = {
		resolvePacketKey: vi.fn(async () => 'packet:auth'),
		loadPacket: vi.fn(async () => ({ sourceRef: 'src/auth.ts', contentHash: digest, workspaceRevision: 42 })),
		record: vi.fn(async input => {
			const normalized = normalizeAnalysisPassLedgerInput(input);
			const existing = rows.find(row => row.passIdentityHash === normalized.passIdentityHash);
			const row = existing ?? { ...normalized, id: rows.length + 1 } as AnalysisPassResultRow;
			if (!existing) rows.push(row);
			return { inserted: !existing, idempotencyKey: row.passKey, row };
		}),
		read: vi.fn(async id => structuredClone(rows.find(row => row.id === id) ?? null)),
	};
	return { deps, rows };
}

describe('lexical source to ledger execution', () => {
	it('accepts the persisted envelope used by the existing job queue', async () => {
		const { deps } = fixture();
		const metadata = coercePersistedPayloadEnvelope(job.metadata, {
			source: 'analysis_jobs', lane: 'lexical_feature_registry', protocol: 'internal', ok: true,
		});
		const result = await executeLexicalPassV1({ ...job, metadata }, deps);
		expect(result.ledgerReceipt.readbackVerified).toBe(true);
		expect(result.lexicalFeatureRegistry.sourceRevision).toBe(job.metadata.sourceRevision);
	});

	it('resolves an alias, persists a qualified result, and reads the stored ID on retry', async () => {
		const { deps, rows } = fixture();
		const first = await executeLexicalPassV1(job, deps);
		const retry = await executeLexicalPassV1({ ...job, id: 'job-2' }, deps);
		expect(first.packetKey).toBe('packet:auth');
		expect(first.lexicalFeatureRegistry.inputChecksum).toBe(digest);
		expect(first.ledgerReceipt.inserted).toBe(true);
		expect(retry.ledgerReceipt).toMatchObject({ id: first.ledgerReceipt.id, inserted: false, readbackVerified: true });
		expect(rows).toHaveLength(1);
		expect(deps.read).toHaveBeenLastCalledWith(first.ledgerReceipt.id);
	});

	it.each([
		{ sourceRef: 'src/wrong.ts' }, { workspaceRevision: '41' },
		{ sourceRevision: 'git:unqualified' }, { text: 'changed content' },
	])('rejects a mismatched source binding %j before persistence', async patch => {
		const { deps } = fixture();
		await expect(executeLexicalPassV1({ ...job, metadata: { ...job.metadata, ...patch } }, deps))
			.rejects.toThrow('SOURCE_BINDING_MISMATCH');
		expect(deps.record).not.toHaveBeenCalled();
	});

	it('rejects a missing packet or unresolved alias', async () => {
		const { deps } = fixture();
		vi.mocked(deps.loadPacket).mockResolvedValue(null);
		await expect(executeLexicalPassV1(job, deps)).rejects.toThrow('SOURCE_BINDING_MISMATCH');
		vi.mocked(deps.resolvePacketKey).mockRejectedValue(new Error('UNRESOLVED'));
		await expect(executeLexicalPassV1(job, deps)).rejects.toThrow('UNRESOLVED');
		expect(deps.record).not.toHaveBeenCalled();
	});

	it('fails the job when the ledger is unavailable', async () => {
		const { deps } = fixture();
		vi.mocked(deps.record).mockResolvedValue(null);
		await expect(executeLexicalPassV1(job, deps)).rejects.toThrow('LEDGER_UNAVAILABLE');
		expect(deps.read).not.toHaveBeenCalled();
	});

	it('rejects a corrupt independent readback', async () => {
		const { deps, rows } = fixture();
		deps.read = async () => ({ ...rows[0], output: { tampered: true } });
		await expect(executeLexicalPassV1(job, deps)).rejects.toThrow('READBACK_MISMATCH');
	});

	it('bounds UTF-8 bytes and rejects unsupported languages before any dependency call', async () => {
		const { deps } = fixture();
		await expect(executeLexicalPassV1({ ...job, metadata: { ...job.metadata, text: '漢'.repeat(90000) } }, deps))
			.rejects.toThrow('SOURCE_TOO_LARGE');
		await expect(executeLexicalPassV1({ ...job, metadata: { ...job.metadata, sourceRef: 'src/auth.py' } }, deps))
			.rejects.toThrow('LANGUAGE_UNSUPPORTED');
		expect(deps.resolvePacketKey).not.toHaveBeenCalled();
	});
});
