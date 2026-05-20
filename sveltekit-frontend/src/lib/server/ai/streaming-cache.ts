import { runChatCompletion } from '$lib/server/ai/openai-facade.js';
import type { OpenAIChatCompletionRequest } from '$lib/server/ai/openai-types.js';
import {
  getCachedStreamResponse,
  storeCachedStreamResponse,
  streamCachedResponse,
} from '$lib/server/ai/cached-stream.js';

export interface StreamCacheOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  chunkSize?: number;
  chunkDelayMs?: number;
}

export interface OpenAISseChunk {
  id: string;
  model: string;
  content?: string;
  done: boolean;
}

export function formatOpenAISseChunk(chunk: OpenAISseChunk): string {
  if (chunk.done) {
    return 'data: [DONE]\n\n';
  }

  return `data: ${JSON.stringify({
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: chunk.model,
    choices: [
      {
        delta: { content: chunk.content ?? '' },
        index: 0,
        finish_reason: null,
      },
    ],
  })}\n\n`;
}

export async function* streamFromCachedCompletion(
  messages: Array<{ role: string; content: string | null | undefined }>,
  options: StreamCacheOptions = {}
): AsyncGenerator<{ content: string; done: boolean; cached: true }> {
  const normalizedMessages = messages.map((message) => ({
    role: message.role,
    content: message.content ?? '',
  }));

  const cached = await getCachedStreamResponse(normalizedMessages, options);
  if (cached === null) {
    return;
  }

  for await (const chunk of streamCachedResponse(cached, options)) {
    yield { content: chunk.content, done: chunk.done, cached: true };
  }
}

export async function* streamFromProviderAndCache(
  req: OpenAIChatCompletionRequest,
  opts: { userId?: string; useMcp?: boolean } = {},
  options: StreamCacheOptions = {}
): AsyncGenerator<{ content: string; done: boolean; cached?: boolean }> {
  const normalizedMessages = req.messages.map((message) => ({
    role: message.role,
    content: message.content ?? '',
  }));

  const cacheOptions = {
    model: req.model,
    temperature: req.temperature ?? options.temperature,
    maxTokens: req.max_tokens ?? options.maxTokens,
    chunkSize: options.chunkSize,
    chunkDelayMs: options.chunkDelayMs,
  };

  const cached = await getCachedStreamResponse(normalizedMessages, cacheOptions);
  if (cached !== null) {
    for await (const chunk of streamCachedResponse(cached, cacheOptions)) {
      yield { content: chunk.content, done: chunk.done, cached: true };
    }
    return;
  }

  const response = await runChatCompletion(req, opts);
  const content = response.choices?.[0]?.message?.content ?? '';

  await storeCachedStreamResponse(normalizedMessages, content, cacheOptions);

  const chunkSize = options.chunkSize ?? 5;
  const chunkDelayMs = options.chunkDelayMs ?? 0;
  let offset = 0;

  while (offset < content.length) {
    const nextOffset = Math.min(offset + chunkSize, content.length);
    const chunk = content.slice(offset, nextOffset);
    offset = nextOffset;
    yield { content: chunk, done: offset >= content.length };

    if (chunkDelayMs > 0 && offset < content.length) {
      await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
    }
  }
}
