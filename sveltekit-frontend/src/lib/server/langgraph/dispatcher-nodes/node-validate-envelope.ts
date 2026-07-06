/**
 * Node: Validate Envelope
 * Decision: Re-validate canonical envelope with Zod schema
 * MCP Tool: envelope:validate
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

export async function nodeValidateEnvelope(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_validate_envelope';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    // Call MCP tool to re-validate envelopes
    const { result, error, duration_ms } = await callMcpTool(ctx, 'envelope:validate', {
      packet_keys: state.candidates.map((c) => c.packet_key),
      strict: true, // hard fail on missing fields
    });

    const validationStats = result?.stats || { passed: 0, failed: 0, confidence_avg: 0 };

    current = recordToolCall(current, {
      tool_name: 'envelope:validate',
      params: { packet_count: state.candidates.length },
      result: validationStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Validation failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else if (validationStats.passed === state.candidates.length) {
      current = {
        ...current,
        action: 'success',
        reason: `All ${state.candidates.length} packets validated (avg confidence: ${validationStats.confidence_avg.toFixed(2)})`,
      };
    } else {
      current = {
        ...current,
        action: 'degraded',
        reason: `${validationStats.passed}/${state.candidates.length} passed validation`,
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
