import { describe, expect, it } from 'vitest';
import { assemblePacketFromGrpcResponse } from './packet-assembler.js';

describe('ACP packet title identity', () => {
	it('derives a full key from a declared source revision and preserves zero topology', () => {
		const metadata = { serviceId: 'retrieval' as const, methodName: 'Search', durationMs: 1, timestamp: new Date(0) };
		const source = { source_ref: 'fixture/source.json', feature_id: 'fixture', function_symbol: 'sample',
			som_row: 0, som_col: 0, community_id: 0, manifold_t: 0 };
		const one = assemblePacketFromGrpcResponse({ ...source, source_revision: `sha256:${'a'.repeat(64)}` }, metadata);
		const two = assemblePacketFromGrpcResponse({ ...source, source_revision: 'a'.repeat(64) }, metadata);
		expect(one).toMatchObject({ som_row: 0, som_col: 0, community_id: 0, manifold_t: 0 });
		expect(one.packet_key).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(two.packet_key).toBe(one.packet_key);
		expect(assemblePacketFromGrpcResponse({ ...source, source_revision: 'b'.repeat(64) }, metadata).packet_key).not.toBe(one.packet_key);
		expect(() => assemblePacketFromGrpcResponse(source, metadata)).toThrow('PACKET_KEY_FALLBACK_REQUIRES_SOURCE_REVISION');
		expect(() => assemblePacketFromGrpcResponse({ ...source, packet_key: 'ace:packet:deadbeef' }, metadata)).toThrow();
	});
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
