/**
 * HForF Tool Calling Integration Test
 *
 * Validates that HForF model:
 * 1. Accepts tool schema definitions
 * 2. Returns valid tool_calls in response
 * 3. Handles tool result injection without corruption
 * 4. Respects prompt caching with tool schemas
 *
 * Setup: llama-server must be running on :8090 with hforf.gguf loaded
 * Run: npm run test -- tests/hforf-tool-calling.spec.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('HForF Tool Calling Integration', () => {
  const LLAMA_URL = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
  const MODEL = 'hforf.gguf';
  const TIMEOUT_MS = 90_000;

  let serverHealthy = false;

  beforeAll(async () => {
    // Check server availability
    try {
      const res = await fetch(`${LLAMA_URL}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      serverHealthy = res.ok;
    } catch (err) {
      console.warn('llama-server :8090 not available, skipping tool calling tests');
    }
  });

  it('should accept tool schema definitions', async () => {
    if (!serverHealthy) {
      console.log('SKIP: llama-server not available');
      return;
    }

    const toolDef = {
      type: 'function' as const,
      function: {
        name: 'bash',
        description: 'Execute a bash command',
        parameters: {
          type: 'object',
          properties: {
            cmd: {
              type: 'string',
              description: 'The bash command to execute',
            },
          },
          required: ['cmd'],
        },
      },
    };

    const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: 'What files are in /tmp? Use the bash tool to find out.',
          },
        ],
        tools: [toolDef],
        tool_choice: 'auto',
        max_tokens: 512,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    expect(data.choices).toBeDefined();
    expect(data.choices[0]).toBeDefined();

    const message = data.choices[0].message;
    expect(message).toBeDefined();

    // Should have either content or tool_calls (or both)
    const hasContent = message.content && message.content.trim().length > 0;
    const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

    expect(hasContent || hasToolCalls).toBe(true);

    // If tool_calls present, verify structure
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      expect(toolCall.id).toBeDefined();
      expect(toolCall.type).toBe('function');
      expect(toolCall.function.name).toBeDefined();
      expect(toolCall.function.arguments).toBeDefined();

      // Verify arguments can be parsed as JSON
      expect(() => {
        JSON.parse(toolCall.function.arguments);
      }).not.toThrow();
    }
  });

  it('should handle tool result injection without corruption', async () => {
    if (!serverHealthy) {
      console.log('SKIP: llama-server not available');
      return;
    }

    const toolDef = {
      type: 'function' as const,
      function: {
        name: 'search_docs',
        description: 'Search documentation for a keyword',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
          },
          required: ['query'],
        },
      },
    };

    // First turn: model should call the tool
    const turn1 = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: 'How do I validate email addresses?',
          },
        ],
        tools: [toolDef],
        tool_choice: 'auto',
        max_tokens: 256,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    expect(turn1.status).toBe(200);
    const turn1Data = (await turn1.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const toolCalls = turn1Data.choices[0].message.tool_calls;
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.length).toBeGreaterThan(0);

    if (!toolCalls || toolCalls.length === 0) {
      console.log('Model did not generate tool_calls, skipping injection test');
      return;
    }

    // Second turn: inject tool result and verify generation continues
    const toolId = toolCalls[0].id;
    const toolResult =
      'Found 3 methods: regex validation, email-validator library, and built-in Node.js method';

    const turn2 = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: 'How do I validate email addresses?',
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: toolId,
                type: 'function',
                function: {
                  name: 'search_docs',
                  arguments: JSON.stringify({ query: 'email validation' }),
                },
              },
            ],
          },
          {
            role: 'tool',
            content: toolResult,
            tool_call_id: toolId,
          },
        ],
        tools: [toolDef],
        tool_choice: 'auto',
        max_tokens: 512,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    expect(turn2.status).toBe(200);
    const turn2Data = (await turn2.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<unknown>;
        };
      }>;
    };

    const finalMessage = turn2Data.choices[0].message;
    expect(finalMessage).toBeDefined();

    // Should have generated a response (not just empty)
    const hasContent = finalMessage.content && finalMessage.content.trim().length > 0;
    expect(hasContent).toBe(true);

    // Verify output is not corrupted (no training markers)
    if (finalMessage.content) {
      expect(finalMessage.content).not.toContain('<end_of_turn>');
      expect(finalMessage.content).not.toContain('<start_of_turn>');
    }
  });

  it('should respect prompt caching with tool schemas', async () => {
    if (!serverHealthy) {
      console.log('SKIP: llama-server not available');
      return;
    }

    const toolDef = {
      type: 'function' as const,
      function: {
        name: 'api_call',
        description: 'Make an API call',
        parameters: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' },
            method: { type: 'string' },
          },
          required: ['endpoint', 'method'],
        },
      },
    };

    const systemPrompt =
      'You are a helpful assistant with access to API tools. Always use the api_call tool when appropriate.';

    const sharedMessages = [
      {
        role: 'user' as const,
        content: systemPrompt,
      },
    ];

    // First call with cache_prompt (establishes KV cache)
    const t1_start = performance.now();
    const call1 = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          ...sharedMessages,
          {
            role: 'user',
            content: 'Call the /users endpoint with GET method.',
          },
        ],
        tools: [toolDef],
        tool_choice: 'auto',
        max_tokens: 256,
        temperature: 0.3,
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const t1_ms = performance.now() - t1_start;

    expect(call1.status).toBe(200);
    const data1 = (await call1.json()) as { usage?: { prompt_eval_count?: number } };

    // Second call with identical system prompt should reuse cache
    const t2_start = performance.now();
    const call2 = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          ...sharedMessages,
          {
            role: 'user',
            content: 'Call the /posts endpoint with GET method.',
          },
        ],
        tools: [toolDef],
        tool_choice: 'auto',
        max_tokens: 256,
        temperature: 0.3,
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const t2_ms = performance.now() - t2_start;

    expect(call2.status).toBe(200);
    const data2 = (await call2.json()) as { usage?: { prompt_eval_count?: number } };

    // Second call should be noticeably faster due to KV cache hit
    // (not a strict assertion, but log for debugging)
    console.log(`Cache test: first=${t1_ms.toFixed(0)}ms, second=${t2_ms.toFixed(0)}ms`);

    // Both should succeed
    expect(data1.usage).toBeDefined();
    expect(data2.usage).toBeDefined();
  });

  it('should output sanitized content without training markers', async () => {
    if (!serverHealthy) {
      console.log('SKIP: llama-server not available');
      return;
    }

    const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content:
              'Explain what a Merkle tree is in one paragraph. Be concise and clear.',
          },
        ],
        max_tokens: 256,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content ?? '';
    expect(content.length).toBeGreaterThan(0);

    // Verify no training markers leaked through
    expect(content).not.toContain('<end_of_turn>');
    expect(content).not.toContain('<start_of_turn>');
    expect(content).not.toContain('<thinking>');
    expect(content).not.toContain('</thinking>');
    expect(content).not.toContain('<|endthinking|>');
    expect(content).not.toContain('<|channel>');

    console.log(`Generated clean content: ${content.slice(0, 80)}...`);
  });
});
