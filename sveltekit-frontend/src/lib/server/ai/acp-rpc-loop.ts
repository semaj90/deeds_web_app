/**
 * ACP RPC Loop with Tool Calling + KV Cache Integration
 *
 * Implements the agent control plane for:
 * - Multi-turn tool calling
 * - KV cache reuse across turns
 * - Streaming responses
 * - MCP tool invocation
 *
 * Flow:
 *   1. User query arrives
 *   2. System prompt + context assembled
 *   3. Stream to llama-server with cache_prompt:true
 *   4. llama-server returns with tool_calls (or text)
 *   5. If tool_calls present: execute, append tool_result, continue loop
 *   6. If finish_reason:'stop': return response
 */

import type { OpenAIMessage } from './openai-types.js';
import type { ToolCall } from './tool-call-parser.js';
import { parseToolCalls, hasToolCalls } from './tool-call-parser.js';

export interface AcpRpcLoopConfig {
  llamaBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  useKvCache: boolean;
  kvCacheTtl: number;
  mcpPort?: number;
}

export interface ToolExecutionResult {
  toolName: string;
  arguments: Record<string, any>;
  result: string;
  error?: string;
  executionTimeMs: number;
}

/**
 * Execute MCP tools (or mock tools for testing)
 */
export async function executeMcpTool(toolName: string, arguments_: Record<string, any>): Promise<string> {
  // In production, call MCP at localhost:8788
  // For now, return mock results
  console.log(`[ACP RPC] Executing tool: ${toolName}`, arguments_);

  // Mock tools for testing
  const mockResults: Record<string, string> = {
    get_time: JSON.stringify({ time: new Date().toISOString() }),
    search_codebase: JSON.stringify({ results: [], total: 0 }),
    list_files: JSON.stringify({ files: [] }),
  };

  return mockResults[toolName] || JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

/**
 * Single turn of the ACP RPC loop
 */
export async function* apcRpcLoopTurn(
  config: AcpRpcLoopConfig,
  messages: OpenAIMessage[],
  toolRound: number = 0
): AsyncGenerator<{ content: string; toolCalls?: ToolCall[]; done: boolean }, void, unknown> {
  if (toolRound >= config.maxToolRounds) {
    yield { content: 'Max tool rounds reached', done: true };
    return;
  }

  // Stream to llama-server
  const response = await fetch(`${config.llamaBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      cache_prompt: config.useKvCache,
      cache_reuse: config.kvCacheTtl,
    }),
  });

  if (!response.ok) {
    throw new Error(`llama-server error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content ?? '';
              if (content) {
                fullContent += content;
                yield { content, done: false };
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Check if response contains tool calls
  if (hasToolCalls(fullContent)) {
    const parsed = parseToolCalls(fullContent);

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: parsed.responseText,
      tool_calls: parsed.toolCalls as any[],
    });

    yield { content: '', toolCalls: parsed.toolCalls, done: false };

    // Execute tools and add results
    const toolResults: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];

    for (const toolCall of parsed.toolCalls) {
      const startMs = Date.now();
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeMcpTool(toolCall.function.name, args);

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });

        console.log(
          `[ACP RPC] Tool executed: ${toolCall.function.name} (${Date.now() - startMs}ms)`
        );
      } catch (err) {
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
        });
      }
    }

    // Add tool results to messages
    messages.push(...(toolResults as any[]));

    // Continue loop for next turn
    yield* apcRpcLoopTurn(config, messages, toolRound + 1);
  } else {
    // No tool calls, conversation complete
    messages.push({
      role: 'assistant',
      content: fullContent,
    });

    yield { content: '', done: true };
  }
}

/**
 * High-level API: run full ACP RPC loop from user query
 */
export async function* runAcpRpcLoop(
  config: AcpRpcLoopConfig,
  systemPrompt: string,
  userQuery: string
): AsyncGenerator<{ content: string; toolCalls?: ToolCall[]; done: boolean }, void, unknown> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery },
  ];

  yield* apcRpcLoopTurn(config, messages, 0);
}
