import { describe, expect, it } from 'vitest';
import { classifyToolResult, finalizeTrace, nextLegalState, validateRoute } from './viterbi-router';
import type { RouteTrace, ToolResult } from './router-types';

function makeResult(overrides: Partial<ToolResult> = {}): ToolResult {
	return {
		toolName: 'kb.trace_search',
		executionId: 'exec:test',
		success: true,
		resultClass: 'candidates',
		resultCount: 1,
		sourceRefCount: 1,
		durationMs: 12,
		requiresProvenance: false,
		...overrides
	};
}

function makeTrace(overrides: Partial<RouteTrace> = {}): RouteTrace {
	return {
		traceId: 'trace:test',
		queryHash: 'query:test',
		query: 'find the route handler',
		decisionId: 'decision:test',
		selectedState: 'RETRIEVE',
		selectedToolName: 'kb.trace_search',
		candidateTools: ['kb.trace_search'],
		proposalId: 'proposal:test',
		proposedArguments: {},
		schemaValid: true,
		approvalRequired: false,
		executed: false,
		recoveryAttempted: false,
		finalState: 'RETRIEVE',
		finalOutcome: 'partial',
		createdAt: new Date('2026-07-10T00:00:00.000Z'),
		updatedAt: new Date('2026-07-10T00:00:00.000Z'),
		...overrides
	};
}

describe('viterbi-router canonical loop', () => {
	it('classifies provenance-missing success into VALIDATE', () => {
		const result = makeResult({ requiresProvenance: true, sourceRefCount: 0 });
		expect(classifyToolResult(result)).toBe('VALIDATE');
		expect(nextLegalState('RETRIEVE', result)).toBe('VALIDATE');
	});

	it('routes transport failures to RECOVER', () => {
		const result = makeResult({ success: false, transportError: true, resultClass: 'transport_error' });
		expect(classifyToolResult(result)).toBe('RECOVER');
		expect(nextLegalState('RETRIEVE', result)).toBe('RECOVER');
	});

	it('finalizes a route trace once and preserves legal transitions', () => {
		const trace = makeTrace();
		const result = makeResult({ requiresProvenance: true, sourceRefCount: 0 });
		const finalTrace = finalizeTrace(trace, result);

		expect(finalTrace.executed).toBe(true);
		expect(finalTrace.finalState).toBe('VALIDATE');
		expect(validateRoute(finalTrace).valid).toBe(true);
		expect(validateRoute(finalTrace).errors).toEqual([]);
	});
});
