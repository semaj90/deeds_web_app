import { describe, expect, it } from 'vitest';
import { assemblePacketFromGrpcResponse } from './packet-assembler.js';

describe('ACP packet title identity', () => {
	it('keeps title_id stable when summary and semantic tags are absent', () => {
		const identity = {
			packet_key: `sha256:${'a'.repeat(64)}`,
			source_ref: 'src/lib/server/retrieval/example.ts',
			feature_id: 'feature:retrieval',
			feature_label: 'Retrieval helper',
			function_symbol: 'findCandidates',
		};
		const metadata = {
			serviceId: 'retrieval' as const,
			methodName: 'Search',
			durationMs: 1,
			timestamp: new Date('2026-10-15T00:00:00.000Z'),
		};

		const withoutSemantics = assemblePacketFromGrpcResponse(identity, metadata);
		const withSemantics = assemblePacketFromGrpcResponse({
			...identity,
			summary: 'Find source-qualified retrieval candidates.',
			semantic_tags: ['retrieval', 'candidate'],
		}, metadata);

		expect(withoutSemantics.title_id).toBe(withSemantics.title_id);
		expect(withoutSemantics.title_id).toMatch(/^title:[a-f0-9]{8}$/);
	});
});
