// src/agents/types.ts
export interface ToolCall {
  tool: string;
  arguments?: Record<string, any>;
}

export interface ToolResult {
  tool: string;
  arguments?: Record<string, any>;
  result: any;
}