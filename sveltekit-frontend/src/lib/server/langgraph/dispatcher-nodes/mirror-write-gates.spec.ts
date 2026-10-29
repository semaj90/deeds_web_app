import { describe, expect, it, vi } from 'vitest';
import type { DispatcherState, NodeContext } from './types.js';
import { nodeSyncNeo4jMirror } from './node-sync-neo4j-mirror.js';
import { nodeSyncQdrantMirror } from './node-sync-qdrant-mirror.js';

function createState(decision: DispatcherState['dispatch_decision']): DispatcherState {
	return {
		query: 'fixture',
		candidates: [{ packet_key: 'fixture:1', source_ref: 'fixture.md', feature_id: 'fixture', confidence: 1, identity_lane: 'canonical' }],
		identity_lane: 'canonical',
		parity_status: 'aligned',
		dispatch_decision: decision,
		dispatch_confidence: 1,
		synthesis_path: [],
		tool_calls: [],
		errors: [],
		latency_ms: 0,
		action: 'success',
	};
}

describe('LangGraph projection write gates', () => {
	it.each([
		['Qdrant', nodeSyncQdrantMirror, 'sync_qdrant'],
		['Neo4j', nodeSyncNeo4jMirror, 'sync_neo4j'],
	] as const)('%s mirror node never dispatches a projection write', async (_name, runNode, decision) => {
		const call = vi.fn();
		const context = { mcpClient: { tools: { call } } } as unknown as NodeContext;

		const result = await runNode(createState(decision), context);

		expect(call).not.toHaveBeenCalled();
		expect(result.action).toBe('escalated');
		expect(result.reason).toContain('blocked in LangGraph');
		expect(result.synthesis_path).toContain(
			decision === 'sync_qdrant' ? 'node_sync_qdrant_mirror' : 'node_sync_neo4j_mirror',
		);
	});
});
