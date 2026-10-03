import { describe, expect, it } from 'vitest';
import {
	buildAnalysisPassIdempotencyKey,
	buildAnalysisPassInputHash,
	buildAnalysisPassOutputHash,
	buildAnalysisPassLedgerEntry,
	classifyAnalysisPassDuplicateGroup,
} from './analysis-pass-results.js';

const baseInput = {
	analysisJobId: '11111111-1111-1111-1111-111111111111',
	evidenceId: '22222222-2222-2222-2222-222222222222',
	caseId: '33333333-3333-3333-3333-333333333333',
	jobType: 'entity_extraction',
	packetKey: 'packet-123',
	sourceRef: 'src/foo.ts',
	sourceRevision: 'source-v1',
	workspaceRevision: 'workspace-v1',
	representationRevision: 'semantic-768-v1',
	family: 'linguistic' as const,
	passName: 'entity_extraction',
	passRevision: 'entity-extraction-v1',
	producerId: 'parent-atlas-analysis-worker',
	producerRevision: 'analysis-worker-v1',
	backend: 'native-ts' as const,
	backendVersion: 'analysis-worker-v1',
	device: 'cpu' as const,
	status: 'succeeded' as const,
	startedAt: '2026-08-11T00:00:00.000Z',
	completedAt: '2026-08-11T00:00:01.000Z',
	payload: { entityCount: 2, reason: 'ok' },
	features: { entityCount: 2 },
	artifacts: { symbols: ['a', 'b'] },
	evidence: [{ sourceRef: 'src/foo.ts', kind: 'span' }],
	warnings: ['note'],
};

describe('analysis pass ledger identity', () => {
	it('derives the same key for the same canonical input', () => {
		const left = buildAnalysisPassIdempotencyKey(baseInput);
		const right = buildAnalysisPassIdempotencyKey({
			...baseInput,
			payload: { entityCount: 99, reason: 'different payload does not change identity' },
		});

		expect(left).toBe(right);
		expect(left).toMatch(/^analysis-pass:/);
	});

	it('changes the key when the source revision changes', () => {
		const left = buildAnalysisPassInputHash(baseInput);
		const right = buildAnalysisPassInputHash({
			...baseInput,
			sourceRevision: 'source-v2',
		});

		expect(left).not.toBe(right);
	});

	it('separates execution keys from logical identity across jobs', () => {
		const logicalInput = { ...baseInput, inputHash: 'stable-content-hash' };
		const first = buildAnalysisPassLedgerEntry(logicalInput);
		const second = buildAnalysisPassLedgerEntry({
			...logicalInput,
			analysisJobId: '44444444-4444-4444-4444-444444444444',
			evidenceId: '55555555-5555-5555-5555-555555555555',
		});

		expect(first.passKey).not.toBe(second.passKey);
		expect(first.passIdentityHash).toBe(second.passIdentityHash);
	});

	it('does not claim a logical identity without an explicit stable input hash', () => {
		const first = buildAnalysisPassLedgerEntry(baseInput);
		const second = buildAnalysisPassLedgerEntry({
			...baseInput,
			analysisJobId: '44444444-4444-4444-4444-444444444444',
			evidenceId: '55555555-5555-5555-5555-555555555555',
		});

		expect(first.passKey).not.toBe(second.passKey);
		expect(first.passIdentityHash).toBeNull();
		expect(second.passIdentityHash).toBeNull();
	});

	it('normalizes payload hashes deterministically', () => {
		const left = buildAnalysisPassOutputHash({ a: 1, b: [1, 2, { c: true }] });
		const right = buildAnalysisPassOutputHash({ b: [1, 2, { c: true }], a: 1 });

		expect(left).toBe(right);
	});

	it('builds a ledger row with explicit provenance defaults preserved', () => {
		const row = buildAnalysisPassLedgerEntry(baseInput);

		expect(row.sourceRef).toBe('src/foo.ts');
		expect(row.packetKey).toBe('packet-123');
		expect(row.passKey).toMatch(/^analysis-pass:/);
		expect(row.passType).toBe('entity_extraction');
		expect(row.output).toEqual(baseInput.payload);
		expect(row.provenance).toMatchObject({
			analysisJobId: baseInput.analysisJobId,
			evidenceId: baseInput.evidenceId,
			passRevision: baseInput.passRevision,
			producerId: 'parent-atlas-analysis-worker',
			producerRevision: 'analysis-worker-v1',
		});
		expect(row.status).toBe('succeeded');
	});
});

describe('analysis pass duplicate classification', () => {
	const base = {
		outputVersions: 1,
		provenanceVersions: 1,
		sourceRevisionVersions: 0,
		passRevisionVersions: 0,
	};

	it('calls output variants stochastic only for a registered stochastic pass', () => {
		expect(classifyAnalysisPassDuplicateGroup({ ...base, passType: 'summarization', outputVersions: 2 }).classification)
			.toBe('stochastic_history');
		expect(classifyAnalysisPassDuplicateGroup({ ...base, passType: 'embedding', outputVersions: 2 }))
			.toMatchObject({ classification: 'ambiguous' });
		expect(classifyAnalysisPassDuplicateGroup({ ...base, passType: 'cache_push', outputVersions: 2 }))
			.toMatchObject({ classification: 'ambiguous' });
	});

	it('does not infer retry or stochastic history for unregistered identical rows', () => {
		expect(classifyAnalysisPassDuplicateGroup({ ...base, passType: 'cache_push' }))
			.toMatchObject({ classification: 'ambiguous' });
	});

	it('keeps revision mixing ahead of output semantics', () => {
		expect(classifyAnalysisPassDuplicateGroup({
			...base,
			passType: 'summarization',
			outputVersions: 2,
			sourceRevisionVersions: 2,
		})).toMatchObject({ classification: 'revision_mixed' });
	});

	it('labels identical deterministic results as identical retries', () => {
		expect(classifyAnalysisPassDuplicateGroup({ ...base, passType: 'lexical_features' }))
			.toMatchObject({ classification: 'identical_retry' });
	});
});
