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
import type { PermissionGrant } from '$lib/server/ace/atlas-tool-registry';
import { checkToolAccess, validateToolName } from '$lib/server/auth/tool-authorization';
import {
  buildLlamaPromptCacheOptionsV1,
  recordLlamaPromptCacheTelemetry,
} from './context-prompt-streamer.js';

export interface AcpRpcLoopConfig {
  llamaBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  useKvCache: boolean;
  /** llama.cpp cache_reuse token threshold; this is not a TTL. */
  cacheReuseMinChunk?: number;
  mcpPort?: number;
  permissionGrant?: PermissionGrant;
}

export interface ToolExecutionResult {
  toolName: string;
  arguments: Record<string, any>;
  result: string;
  error?: string;
  executionTimeMs: number;
}

/**
 * Execute MCP tools with authorization check
 */
export async function executeMcpTool(
  toolName: string,
  arguments_: Record<string, any>,
  permissionGrant?: PermissionGrant
): Promise<string> {
  // Validate tool name format
  const validatedToolName = validateToolName(toolName);

  // Check authorization if grant provided
  if (permissionGrant) {
    try {
      await checkToolAccess(validatedToolName, permissionGrant);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Permission denied';
      console.error(`[ACP RPC] Tool authorization failed: ${toolName}`, message);
      return JSON.stringify({ error: message });
    }
  }

  console.log(`[ACP RPC] Executing tool: ${validatedToolName}`, arguments_);

  // Mock tools for testing
  const mockResults: Record<string, string> = {
    get_time: JSON.stringify({ time: new Date().toISOString() }),
    search_codebase: JSON.stringify({ results: [], total: 0 }),
    list_files: JSON.stringify({ files: [] }),
  };

  return mockResults[validatedToolName] || JSON.stringify({ error: `Unknown tool: ${validatedToolName}` });
}

/**
 * Execute a batch of tool calls concurrently and return their results in the
 * SAME order as `toolCalls`, regardless of which one actually finishes first
 * (`Promise.all` resolves in input-array order). `executor` never rejects the
 * overall batch on a single failure -- each call has its own try/catch, so a
 * failing tool call yields a `{ error }` JSON payload for that one
 * `tool_call_id` instead of aborting its siblings.
 *
 * Extracted as an injectable-executor pure function (parent-atlas-ace-bitfrost-
 * cache-correctness, T3 "MCP tool-call parallelism") so the concurrency
 * property is directly unit-testable without a live llama-server, MCP
 * connection, or `executeMcpTool`'s auth/mock dispatch.
 */
export async function executeToolCallsInParallel(
  toolCalls: ToolCall[],
  executor: (name: string, args: Record<string, any>) => Promise<string>
): Promise<Array<{ role: 'tool'; tool_call_id: string; content: string }>> {
  return Promise.all(
    toolCalls.map(async (toolCall) => {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executor(toolCall.function.name, args);
        return { role: 'tool' as const, tool_call_id: toolCall.id, content: result };
      } catch (err) {
        return {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
        };
      }
    })
  );
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
      stream_options: { include_usage: true },
      ...buildLlamaPromptCacheOptionsV1({
        cachePrompt: config.useKvCache,
        cacheReuseMinChunk: config.cacheReuseMinChunk,
      }),
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
              if (config.useKvCache) {
                recordLlamaPromptCacheTelemetry(config.model, parsed, 'acp');
              }
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

    // Execute tools concurrently, not serially. NOTE: multiple tool_calls in one
    // model turn is only a concurrency *allowance*, not a semantic-independence
    // guarantee -- the model can legitimately emit calls that touch the same
    // resource. This still runs them via Promise.all today (no per-tool admission
    // policy yet); results correlate back via `tool_call_id`, not array/completion
    // order (see `executeToolCallsInParallel`). A future ToolExecutionPolicyV1
    // (per-tool concurrency class + keyed-write serialization) should gate this
    // instead of assuming every same-turn batch is safe to run fully concurrently.
    const toolResults = await executeToolCallsInParallel(parsed.toolCalls, async (name, args) => {
      const startMs = Date.now();
      const result = await executeMcpTool(name, args, config.permissionGrant);
      console.log(`[ACP RPC] Tool executed: ${name} (${Date.now() - startMs}ms)`);
      return result;
    });

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
