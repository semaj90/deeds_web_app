/**
 * Node: Sync Neo4j Mirror
 * Decision: Create/update Neo4j :CanonicalPacket nodes and relationships
 * MCP Tool: mirror:sync_neo4j
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

export async function nodeSyncNeo4jMirror(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_sync_neo4j_mirror';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Filter to only canonical packets
    const canonicalPackets = state.candidates.filter((c) => c.identity_lane === 'canonical');
    if (canonicalPackets.length === 0) {
      current = {
        ...current,
        action: 'success',
        reason: 'No canonical packets to sync (non-blocking)',
      };
      const totalDuration = Date.now() - startTime;
      nodeExit(nodeName, current, totalDuration);
      return { ...current, latency_ms: totalDuration };
    }

    // Call MCP tool to sync to Neo4j
    const { result, error, duration_ms } = await callMcpTool(ctx, 'mirror:sync_neo4j', {
      packets: canonicalPackets.map((c) => ({
        packet_key: c.packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        summary: c.summary,
        confidence: c.confidence,
      })),
      create_edges: ['BELONGS_TO_FEATURE', 'BELONGS_TO_CLUSTER', 'SIMILAR_TOPOLOGY'],
    });

    const syncStats = result?.stats || { nodes_created: 0, edges_created: 0, failed: 0 };

    current = recordToolCall(current, {
      tool_name: 'mirror:sync_neo4j',
      params: { packet_count: canonicalPackets.length },
      result: syncStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Neo4j sync failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else {
      current = {
        ...current,
        action: 'success',
        reason: `Created ${syncStats.nodes_created} nodes, ${syncStats.edges_created} edges in Neo4j`,
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
