// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const { mockSelect, mockInsert, mockEq, mockSql, mockResolveCanonicalPacketKey } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockInsert: vi.fn(),
	mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
	mockSql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
	mockResolveCanonicalPacketKey: vi.fn(async () => 'packet:deterministic'),
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: mockEq,
	sql: mockSql,
}));

vi.mock('../atlas/identity/packet-identity-resolver.js', () => ({
	resolveCanonicalPacketKey: mockResolveCanonicalPacketKey,
}));

const existingRow = {
	id: 4242,
	passKey: 'analysis-pass:deterministic-demo',
	passIdentityHash: 'identity-hash-demo',
	packetKey: 'packet:deterministic',
	sourceRef: 'src/deterministic.ts',
	featureId: null,
	passType: 'ast_symbols',
	status: 'succeeded',
	inputHash: 'input-hash-demo',
	promptHash: null,
	modelName: null,
	temperature: null,
	maxTokens: null,
	output: { symbolCount: 3 },
	scores: { score: 1 },
	indexPush: {},
	provenance: { passName: 'ast_symbols' },
	sourceRevision: 'source-v1',
	passRevision: 'ast-symbols-v1',
	createdAt: '2026-08-11T00:00:00.000Z',
	updatedAt: '2026-08-11T00:00:00.000Z',
};

const deterministicInput = {
	analysisJobId: '11111111-1111-1111-1111-111111111111',
	evidenceId: '22222222-2222-2222-2222-222222222222',
	jobType: 'ast_symbols',
	packetKey: 'packet:deterministic',
	sourceRef: 'src/deterministic.ts',
	sourceRevision: 'source-v1',
	workspaceRevision: 'workspace-v1',
	representationRevision: 'semantic-768-v1',
	family: 'structural' as const,
	passName: 'ast_symbols',
	passRevision: 'ast-symbols-v1',
	passType: 'ast_symbols',
	inputHash: 'stable-ast-input-hash',
	producerId: 'parent-atlas-analysis-worker',
	producerRevision: 'analysis-worker-v1',
	backend: 'native-ts' as const,
	backendVersion: 'analysis-worker-v1',
	device: 'cpu' as const,
	status: 'succeeded' as const,
	startedAt: '2026-08-11T00:00:00.000Z',
	completedAt: '2026-08-11T00:00:01.000Z',
	payload: { symbolCount: 3 },
	features: { symbolCount: 3 },
	artifacts: { symbols: ['x', 'y', 'z'] },
	evidence: [{ sourceRef: 'src/deterministic.ts', kind: 'span' }],
	warnings: [],
};

function buildDeterministicSelectChain(rows = [existingRow]) {
	const limit = vi.fn(async () => rows);
	const orderBy = vi.fn(() => ({ limit }));
	const where = vi.fn(() => ({ orderBy }));
	const from = vi.fn(() => ({ where }));
	mockSelect.mockReturnValue({ from });
	return { from, where, orderBy, limit };
}

describe('analysis pass ledger duplicate-delivery idempotency', () => {
	it('reuses the existing deterministic receipt and does not insert a duplicate row', async () => {
		buildDeterministicSelectChain();

	const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
	const first = await recordAnalysisPassResult(deterministicInput);
	const second = await recordAnalysisPassResult(deterministicInput);

	expect(first?.inserted).toBe(false);
	expect(second?.inserted).toBe(false);
	expect(first?.row).toEqual(existingRow);
	expect(second?.row).toEqual(existingRow);
	expect(first?.idempotencyKey).toBe(second?.idempotencyKey);
	expect(first?.idempotencyKey).toMatch(/^analysis-pass:/);
	expect(mockInsert).not.toHaveBeenCalled();
		expect(mockSelect).toHaveBeenCalledTimes(2);
	});

	it('records staged admission in provenance while keeping succeeded as execution status', async () => {
		vi.clearAllMocks();
		mockResolveCanonicalPacketKey.mockResolvedValue('packet:deterministic');
		buildDeterministicSelectChain([]);
		const insertedValues = vi.fn((row) => ({
			returning: vi.fn(async () => [{ ...row, id: 5150 }]),
		}));
		mockInsert.mockReturnValue({ values: insertedValues });

		const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
		const result = await recordAnalysisPassResult(deterministicInput, { stageAsCandidateOnly: true });
		const [inserted] = insertedValues.mock.calls[0];
		const provenance = inserted.provenance as Record<string, unknown>;

		expect(result?.inserted).toBe(true);
		expect(inserted.status).toBe('succeeded');
		expect(inserted.packetKey).toBe(deterministicInput.packetKey);
		expect(provenance.stagedObservation).toMatchObject({
			admissionDisposition: 'CANDIDATE_ONLY',
			canonicalAuthority: false,
			writesCanonicalState: false,
			resolvedStoragePacketKey: deterministicInput.packetKey,
			packetIdentityResolution: 'DIRECT_STORAGE_ROW',
		});
		expect(mockInsert).toHaveBeenCalledTimes(1);
	});

	it('rejects deterministic reuse when the existing row has no matching staged disposition', async () => {
		vi.clearAllMocks();
		mockResolveCanonicalPacketKey.mockResolvedValue('packet:deterministic');
		buildDeterministicSelectChain([existingRow]);

		const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
		await expect(recordAnalysisPassResult(deterministicInput, { stageAsCandidateOnly: true }))
			.rejects.toThrow('STAGED_ANALYSIS_PASS_REUSE_MISMATCH');
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('reuses a matching staged deterministic observation across execution retries', async () => {
		vi.clearAllMocks();
		mockResolveCanonicalPacketKey.mockResolvedValue('packet:deterministic');
		const { buildStagedAnalysisPassLedgerEntryV1 } = await import('../db/schema/analysis-pass-results.js');
		const staged = buildStagedAnalysisPassLedgerEntryV1({
			...deterministicInput,
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
		}, {
			suppliedPacketKey: 'packet:deterministic',
			resolvedStoragePacketKey: 'packet:deterministic',
		});
		const stagedProvenance = staged.provenance as Record<string, unknown>;
		buildDeterministicSelectChain([{
			...existingRow,
			provenance: { stagedObservation: stagedProvenance.stagedObservation },
		}]);

		const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
		const first = await recordAnalysisPassResult({
			...deterministicInput,
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
		}, { stageAsCandidateOnly: true });
		const retry = await recordAnalysisPassResult({
			...deterministicInput,
			analysisJobId: 'retry-job',
			evidenceId: 'retry-evidence',
			startedAt: '2026-10-03T02:00:00.000Z',
			completedAt: '2026-10-03T02:00:01.000Z',
			producerId: 'nlp-sidecar',
			producerRevision: 'nlp-sidecar-v1',
		}, { stageAsCandidateOnly: true });

		expect(first?.inserted).toBe(false);
		expect(retry?.inserted).toBe(false);
		expect(first?.idempotencyKey).toBe(existingRow.passKey);
		expect(retry?.idempotencyKey).toBe(existingRow.passKey);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('stores alias-resolved staged observations under the existing physical row key', async () => {
		vi.clearAllMocks();
		mockResolveCanonicalPacketKey.mockResolvedValue('packet:deterministic');
		buildDeterministicSelectChain([]);
		const insertedValues = vi.fn((row) => ({
			returning: vi.fn(async () => [{ ...row, id: 6161 }]),
		}));
		mockInsert.mockReturnValue({ values: insertedValues });

		const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
		await recordAnalysisPassResult({
			...deterministicInput,
			packetKey: 'ace:packet:123456789012',
		}, { stageAsCandidateOnly: true });
		const [inserted] = insertedValues.mock.calls[0];
		const observation = (inserted.provenance as Record<string, any>).stagedObservation;

		expect(inserted.packetKey).toBe('packet:deterministic');
		expect(observation).toMatchObject({
			resolvedStoragePacketKey: 'packet:deterministic',
			packetIdentityResolution: 'EXISTING_ALIAS',
			suppliedPacketKey: 'ace:packet:123456789012',
		});
	});

	it('rejects unresolved packet identity before selecting or inserting a ledger row', async () => {
		vi.clearAllMocks();
		mockResolveCanonicalPacketKey.mockRejectedValue(new Error('PACKET_IDENTITY_UNRESOLVED'));

		const { recordAnalysisPassResult } = await import('./analysis-pass-results.js');
		await expect(recordAnalysisPassResult(deterministicInput, { stageAsCandidateOnly: true }))
			.rejects.toThrow('PACKET_IDENTITY_UNRESOLVED');
		expect(mockSelect).not.toHaveBeenCalled();
		expect(mockInsert).not.toHaveBeenCalled();
	});
});
