import { describe, expect, it } from 'vitest';
import {
	buildAnalysisPassIdempotencyKey,
	buildAnalysisPassIdentityHash,
	resolveExecutionSemantics,
	type AnalysisPassLedgerInput,
} from './analysis-pass-results.ts';

const baseInput: AnalysisPassLedgerInput = {
	analysisJobId: 'job-a',
	evidenceId: 'evidence-a',
	jobType: 'entity_extraction',
	packetKey: 'packet-a',
	sourceRef: 'src/a.ts',
	sourceRevision: 'source-rev-a',
	family: 'linguistic',
	passName: 'ast_symbols',
	passRevision: 'ast-symbols-v1',
	backend: 'native-ts',
	backendVersion: 'fixture-v1',
	device: 'cpu',
	status: 'succeeded',
	startedAt: '2026-09-27T00:00:00.000Z',
	completedAt: '2026-09-27T00:00:01.000Z',
};

describe('analysis pass identity/execution contract', () => {
	it('separates execution-scoped keys from stable logical pass identity', () => {
		const first = { ...baseInput, inputHash: 'stable-input-v1' };
		const retryFromAnotherJob = {
			...first,
			analysisJobId: 'job-b',
			evidenceId: 'evidence-b',
		};

		expect(buildAnalysisPassIdempotencyKey(first)).not.toBe(
			buildAnalysisPassIdempotencyKey(retryFromAnotherJob),
		);
		expect(buildAnalysisPassIdentityHash(first)).toBe(
			buildAnalysisPassIdentityHash(retryFromAnotherJob),
		);
		expect(buildAnalysisPassIdentityHash(baseInput)).toBeNull();
	});

	it('keeps deterministic, stochastic-history, and observed-event semantics distinct', () => {
		expect(resolveExecutionSemantics('ast_symbols')).toBe('deterministic_idempotent');
		expect(resolveExecutionSemantics('summarization')).toBe('stochastic_history');
		expect(resolveExecutionSemantics('tool_execution')).toBe('observed_event');
		expect(resolveExecutionSemantics('unclassified_pass')).toBe('observed_event');
	});
});
