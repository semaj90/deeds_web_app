/**
 * Node: Sync Qdrant Mirror
 * Projection writes are blocked in LangGraph; use the authorized promotion path.
 */

import type { DispatcherState, NodeContext } from './types.js';
import { updateSynthesisPath, nodeEntry, nodeExit } from './node-helpers.js';

export async function nodeSyncQdrantMirror(
	state: DispatcherState,
	_ctx: NodeContext
): Promise<DispatcherState> {
	const nodeName = 'node_sync_qdrant_mirror';
	const startTime = Date.now();
	nodeEntry(nodeName, state);

	const current = {
		...updateSynthesisPath(state, nodeName),
		action: 'escalated' as const,
		reason: 'Qdrant projection write blocked in LangGraph; use the authorized promotion queue with admission and readback.',
	};
	const totalDuration = Date.now() - startTime;
	nodeExit(nodeName, current, totalDuration);
	return { ...current, latency_ms: totalDuration };
}
