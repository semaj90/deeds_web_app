/**
 * Node: Escalate Operator
 * Decision: Route unhandled or fallback decision to operator alert queue
 * MCP Tool: escalation:route
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

export async function nodeEscalateOperator(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_escalate_operator';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Call MCP tool to route to operator escalation
    const { result, error, duration_ms } = await callMcpTool(ctx, 'escalation:route', {
      decision: state.dispatch_decision,
      reason: state.reason || 'Unhandled dispatch decision',
      query: state.query,
      candidate_count: state.candidates.length,
      synthesis_path: state.synthesis_path,
      errors: state.errors,
      timestamp: new Date().toISOString(),
      severity: state.errors.length > 0 ? 'high' : 'medium',
    });

    const escalationResult = result?.escalation_id || null;

    current = recordToolCall(current, {
      tool_name: 'escalation:route',
      params: { decision: state.dispatch_decision },
      result: { escalation_id: escalationResult },
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Escalation routing failed: ${error}`);
      current = { ...current, action: 'failed', reason: error };
    } else if (escalationResult) {
      current = {
        ...current,
        action: 'escalated',
        reason: `Escalated to operator (ID: ${escalationResult})`,
      };
    } else {
      current = { ...current, action: 'degraded', reason: 'Escalation routed but no ID returned' };
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
