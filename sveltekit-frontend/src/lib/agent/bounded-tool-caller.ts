/**
 * Bounded Tool Caller: Routes tool calls from Gemma4 through the bounded tool gateway.
 *
 * Handles two types of tool calls:
 * 1. Bounded tools (topology.status, packet.search, etc) — via RPC gateway
 * 2. In-process tools (rag_search, case_search, etc) — direct invocation
 *
 * Returns normalized results so Gemma4 can reason over observations.
 */

import { runTool, type ToolCall, type ToolResult } from './tool-registry';

export type InProcessToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolCallResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  execution_time_ms?: number;
  tool_type: 'bounded' | 'in-process';
};

/**
 * Call a tool by name. Routes to either:
 * - Bounded tool gateway (for topology/packet/graph tools)
 * - In-process handler (for rag_search, case_search, etc)
 */
export async function callToolSafely(call: InProcessToolCall): Promise<ToolCallResult> {
  const { name, arguments: args } = call;

  // Bounded tools — route via registry
  if (isBoundedTool(name)) {
    const result = await runTool({ name, arguments: args });
    return {
      ...result,
      tool_type: 'bounded',
    };
  }

  // In-process tools — handled by caller
  return {
    ok: false,
    error: `Unknown tool: ${name}. Use in-process tool handler instead.`,
    tool_type: 'in-process',
  };
}

/**
 * Check if a tool name is a bounded tool (vs in-process)
 */
function isBoundedTool(name: string): boolean {
  const boundedToolNames = [
    'topology.status',
    'packet.search',
    'concept.stats',
    'graph.nearest',
    'cache.peek',
  ];
  return boundedToolNames.includes(name);
}

/**
 * Extract tool calls from Gemma4 response text.
 * Looks for either:
 * 1. JSON { "tool_call": { "name": "...", "arguments": {...} } } blocks
 * 2. Ollama native tool_calls array
 */
export function extractToolCalls(
  text: string | undefined,
  ollmaToolCalls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
): InProcessToolCall[] {
  const calls: InProcessToolCall[] = [];

  // Parse Ollama native tool_calls
  if (ollmaToolCalls && Array.isArray(ollmaToolCalls)) {
    for (const toolCall of ollmaToolCalls) {
      if (toolCall.function) {
        calls.push({
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || {},
        });
      }
    }
  }

  // Parse JSON { "tool_call": {...} } blocks
  if (text) {
    const toolCallRegex = /"tool_call"\s*:\s*(\{[^}]+\})/g;
    let match;
    while ((match = toolCallRegex.exec(text)) !== null) {
      try {
        const toolObj = JSON.parse(match[1]);
        if (toolObj.name && toolObj.arguments) {
          calls.push({
            name: toolObj.name,
            arguments: toolObj.arguments,
          });
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return calls;
}

/**
 * Format a tool result back into Ollama message format for re-prompting.
 */
export function formatToolResult(toolResult: ToolCallResult): string {
  if (toolResult.ok) {
    return JSON.stringify(toolResult.data || {});
  } else {
    return `Error: ${toolResult.error || 'Unknown error'}`;
  }
}
