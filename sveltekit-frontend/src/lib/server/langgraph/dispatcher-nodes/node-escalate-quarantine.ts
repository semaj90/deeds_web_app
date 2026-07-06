/**
 * Node: Escalate Quarantine
 * Decision: Packet failed identity validation → route to operator review queue
 * MCP Tool: identity:quarantine
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

export async function nodeEscalateQuarantine(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_escalate_quarantine';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    // Update synthesis path
    let current = updateSynthesisPath(state, nodeName);

    // Call MCP tool to route to operator review queue
    const { result, error, duration_ms } = await callMcpTool(ctx, 'identity:quarantine', {
      packet_keys: state.candidates.map((c) => c.packet_key),
      reason: `Identity validation failed: lane=${state.identity_lane}, confidence=${state.dispatch_confidence}`,
      timestamp: new Date().toISOString(),
    });

    current = recordToolCall(current, {
      tool_name: 'identity:quarantine',
      params: { packet_count: state.candidates.length },
      result: result ? { queued: true } : undefined,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `MCP tool failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else {
      current = { ...current, action: 'success', reason: 'Routed to operator queue' };
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
