/**
 * Tool registry: runtime dispatch for bounded tools.
 * Single source of truth for Gemma4 tool execution.
 * No raw JSON loading, no unbounded operations.
 */

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  execution_time_ms?: number;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const tools = new Map<string, ToolHandler>();

export function registerTool(name: string, handler: ToolHandler) {
  if (tools.has(name)) {
    console.warn(`Tool '${name}' already registered, overwriting`);
  }
  tools.set(name, handler);
}

export async function runTool(call: ToolCall): Promise<ToolResult> {
  const startMs = performance.now();
  const handler = tools.get(call.name);

  if (!handler) {
    return {
      ok: false,
      error: `Unknown tool: ${call.name}. Available: ${Array.from(tools.keys()).join(', ')}`,
    };
  }

  try {
    const result = await handler(call.arguments);
    return {
      ...result,
      execution_time_ms: Math.round(performance.now() - startMs),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || String(err),
      execution_time_ms: Math.round(performance.now() - startMs),
    };
  }
}

export function getToolNames(): string[] {
  return Array.from(tools.keys());
}
