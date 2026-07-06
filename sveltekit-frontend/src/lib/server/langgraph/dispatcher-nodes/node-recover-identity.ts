/**
 * Node: Recover Identity
 * Decision: Attempt to recover packet_key from byte span or content hash
 * MCP Tool: identity:recover
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

export async function nodeRecoverIdentity(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_recover_identity';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Call MCP tool to attempt recovery (Tier 2 identity worker recovery lanes)
    const { result, error, duration_ms } = await callMcpTool(ctx, 'identity:recover', {
      packet_keys: state.candidates.map((c) => c.packet_key),
      recovery_method: 'deterministic', // byte-span or content hash
      fallback_lane: state.identity_lane === 'recoverable' ? 'recoverable' : 'quarantine',
    });

    const recoveryStats = result?.stats || { recovered: 0, failed: 0 };

    current = recordToolCall(current, {
      tool_name: 'identity:recover',
      params: { packet_count: state.candidates.length },
      result: recoveryStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Recovery attempt failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else if (recoveryStats.recovered > 0) {
      current = {
        ...current,
        action: 'success',
        reason: `Recovered ${recoveryStats.recovered}/${state.candidates.length} packets`,
      };
    } else {
      current = { ...current, action: 'degraded', reason: 'No packets could be recovered' };
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
