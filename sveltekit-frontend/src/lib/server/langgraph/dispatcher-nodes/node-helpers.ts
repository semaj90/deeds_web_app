/**
 * Node Helper Functions — Common Patterns Across All 9 Nodes
 */

import type { DispatcherState, ToolCall, NodeContext } from './types.js';

export function updateSynthesisPath(state: DispatcherState, nodeName: string): DispatcherState {
  return {
    ...state,
    synthesis_path: [...state.synthesis_path, nodeName],
  };
}

export function recordToolCall(
  state: DispatcherState,
  toolCall: ToolCall
): DispatcherState {
  return {
    ...state,
    tool_calls: [...state.tool_calls, toolCall],
  };
}

export function recordError(state: DispatcherState, error: string): DispatcherState {
  return {
    ...state,
    errors: [...state.errors, error],
  };
}

export async function callMcpTool(
  ctx: NodeContext,
  toolName: string,
  params: Record<string, any>
): Promise<{ result: any; error?: string; duration_ms: number }> {
  const startTime = Date.now();
  try {
    const result = await ctx.mcpClient.tools.call(toolName, params);
    const duration_ms = Date.now() - startTime;
    console.log(`[MCP] ${toolName} succeeded in ${duration_ms}ms`);
    return { result, duration_ms };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    const error = String(err);
    console.error(`[MCP] ${toolName} failed after ${duration_ms}ms:`, error);
    return { result: null, error, duration_ms };
  }
}

export function nodeEntry(nodeName: string, state: DispatcherState): void {
  console.log(
    `[${nodeName}] ENTRY | decision=${state.dispatch_decision} | lane=${state.identity_lane} | candidates=${state.candidates.length}`
  );
}

export function nodeExit(
  nodeName: string,
  state: DispatcherState,
  durationMs: number
): void {
  console.log(
    `[${nodeName}] EXIT | action=${state.action} | path_len=${state.synthesis_path.length} | latency=${durationMs}ms`
  );
}

export function validateCandidates(candidates: any[]): boolean {
  return (
    Array.isArray(candidates) &&
    candidates.every((c) => c.packet_key && c.feature_id && typeof c.confidence === 'number')
  );
}
