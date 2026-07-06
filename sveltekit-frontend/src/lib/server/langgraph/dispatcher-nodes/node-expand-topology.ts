/**
 * Node: Expand Topology
 * Decision: Query Neo4j for K-hop neighbors to enrich context
 * MCP Tool: graph:expand
 */

import type { DispatcherState, NodeContext } from './types.js';
import {
  updateSynthesisPath,
  recordToolCall,
  recordError,
  callMcpTool,
  nodeEntry,
  nodeExit,
} from './node-helpers.js';

export async function nodeExpandTopology(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_expand_topology';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Call MCP tool to expand neighborhood in Neo4j
    const { result, error, duration_ms } = await callMcpTool(ctx, 'graph:expand', {
      feature_ids: [...new Set(state.candidates.map((c) => c.feature_id))],
      hops: 2,
      limit_per_hop: 10,
      relationship_types: ['USES', 'IMPORTS', 'BELONGS_TO_CLUSTER', 'SIMILAR_TOPOLOGY'],
    });

    const expandStats = result?.stats || { neighbors_found: 0, edges_traversed: 0 };

    current = recordToolCall(current, {
      tool_name: 'graph:expand',
      params: { feature_count: state.candidates.length, hops: 2 },
      result: expandStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Topology expansion failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else {
      current = {
        ...current,
        action: 'success',
        reason: `Found ${expandStats.neighbors_found} neighbors, traversed ${expandStats.edges_traversed} edges`,
        result: result,
      };
    }

    const totalDuration = Date.now() - startTime;
    nodeExit(nodeName, current, totalDuration);
    return { ...current, latency_ms: totalDuration };
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = String(err);
    let current = recordError(state, errorMsg);
    current = { ...current, action: 'failed', reason: errorMsg, latency_ms: totalDuration };
    nodeExit(nodeName, current, totalDuration);
    return current;
  }
}
