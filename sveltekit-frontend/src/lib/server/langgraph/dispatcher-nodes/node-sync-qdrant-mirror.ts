/**
 * Node: Sync Qdrant Mirror
 * Decision: Push canonical packet data to Qdrant payload
 * MCP Tool: mirror:sync_qdrant
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

export async function nodeSyncQdrantMirror(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_sync_qdrant_mirror';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Filter to only canonical packets (others are mirrors only)
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

    // Call MCP tool to sync to Qdrant
    const { result, error, duration_ms } = await callMcpTool(ctx, 'mirror:sync_qdrant', {
      packets: canonicalPackets.map((c) => ({
        packet_key: c.packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        identity_lane: c.identity_lane,
        confidence: c.confidence,
        summary: c.summary,
      })),
    });

    const syncStats = result?.stats || { synced: 0, failed: 0 };

    current = recordToolCall(current, {
      tool_name: 'mirror:sync_qdrant',
      params: { packet_count: canonicalPackets.length },
      result: syncStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Qdrant sync failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else if (syncStats.synced === canonicalPackets.length) {
      current = {
        ...current,
        action: 'success',
        reason: `Synced ${syncStats.synced} packets to Qdrant`,
      };
    } else {
      current = {
        ...current,
        action: 'degraded',
        reason: `${syncStats.synced}/${canonicalPackets.length} synced to Qdrant`,
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
