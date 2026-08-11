// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const { mockSelect, mockInsert, mockEq, mockSql } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockInsert: vi.fn(),
	mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
	mockSql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
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

function buildDeterministicSelectChain() {
	const limit = vi.fn(async () => [existingRow]);
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
});
