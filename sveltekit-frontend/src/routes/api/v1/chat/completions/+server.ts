/**
 * OpenAI-compatible chat completions endpoint.
 * POST /api/v1/chat/completions
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { bifrostChat } from '$lib/server/ollama.js';

const requestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string().optional(),
    })
  ),
  max_tokens: z.number().optional(),
  temperature: z.number().optional().default(0.3),
  use_mcp: z.boolean().optional().default(true),
  stream: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { model, messages, temperature, use_mcp, stream } = requestSchema.parse(body);
    const startMs = performance.now();

    // Extract last user message
    const lastMsg = messages.filter((m) => m.role === 'user').pop();
    if (!lastMsg?.content) {
      return error(400, 'No user message found');
    }

    // Call /api/opencode if use_mcp
    let toolContext: any = { tools: [], replayTrace: {} };
    if (use_mcp) {
      try {
        const openRes = await fetch(new URL('/api/opencode', request.url).href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ query: lastMsg.content }),
        });
        if (openRes.ok) {
          toolContext = await openRes.json();
        }
      } catch (e) {
        console.warn('[v1/completions] OpenCode failed');
      }
    }

    // Build prompt
    const systemPrompt = messages.find((m) => m.role === 'system')?.content || 'You are a helpful assistant.';
    const messagesForModel = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content || '' }));

    // Append tool context if available
    if (toolContext.tools?.length > 0) {
      const lastUserIdx = messagesForModel.findIndex((m) => m.role === 'user');
      if (lastUserIdx >= 0) {
        messagesForModel[lastUserIdx].content += `\n[Available tools: ${toolContext.tools.map((t: any) => t.name).join(', ')}]`;
      }
    }

    // Call Gemma4
    const modelName = model === 'yorha-legal' ? 'gemma4-rotorquant:latest' : model;
    const response = await bifrostChat(
      [{ role: 'system', content: systemPrompt }, ...messagesForModel],
      modelName,
      { temperature }
    );

    // Return OpenAI response
    return json({
      object: 'chat.completion',
      id: `chatcmpl-${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(messagesForModel.join('').length / 4),
        completion_tokens: Math.ceil(response.length / 4),
        total_tokens: Math.ceil((messagesForModel.join('').length + response.length) / 4),
      },
      yorha: {
        aceUsed: true,
        contextChunks: toolContext.packets?.length || 0,
        toolsNarrowed: toolContext.tools?.length || 0,
        cacheHit: toolContext.cache?.rpcHit ? 'rpc' : 'none',
        durationMs: performance.now() - startMs,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return error(400, 'Invalid request');
    }
    console.error('[v1/completions]', err);
    return error(500, 'Internal error');
  }
};
