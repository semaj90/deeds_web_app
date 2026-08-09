/**
 * LLM Router - Local-first streaming with GPU acceleration
 *
 * Providers:
 *   - tensorrt: TensorRT-LLM on GPU (primary, requires GPU arbiter lease)
 *   - llama-server: llama-server.exe :8090 (fallback; chat/synthesis lane, never Ollama)
 *
 * Auto-fallback: tensorrt → llama-server
 *
 * Usage:
 *   const stream = await llmRouter.generateStream({ prompt, provider, model });
 *   for await (const chunk of stream) { console.log(chunk.content); }
 */

import { isLegalTask, getOptimalModel, OLLAMA_CONFIG } from '$lib/server/ai/ollama-config.js';
import { ENV } from '$lib/server/env.server.js';

const LLAMA_SERVER_URL = ENV.TURBOQUANT_BASE_URL ?? ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';

interface StreamRequest {
  prompt: string;
  provider?: 'llama-server' | 'tensorrt';
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface StreamChunk {
  content: string;
  text: string;
  done: boolean;
  metadata?: {
    provider: string;
    model: string;
    confidence?: number;
    sources?: Array<{ title: string; url: string }>;
    searchQueries?: string[];
  };
}

async function* streamLlamaServer(request: StreamRequest): AsyncGenerator<StreamChunk> {
  // Model label only — llama-server ignores the `model` field and serves whatever
  // GGUF is currently loaded (verified live: hforf.gguf, an alias of
  // gemma4-legal-iq4xs-direct.gguf). ollama-config registry still picks a sensible
  // label for logging/metadata.
  const model = request.model ?? (
    isLegalTask(request.prompt)
      ? getOptimalModel('legal-analysis')[0]
      : getOptimalModel('generation')[0]
  ) ?? OLLAMA_CONFIG.defaultModel;

  const messages = request.systemPrompt
    ? [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: request.prompt }]
    : [{ role: 'user', content: request.prompt }];

  // stream: true is REQUIRED for llama-server :8090 — Gemma4 fills reasoning_content
  // before content; a non-streaming call can exhaust max_tokens on thinking alone.
  const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048
    }),
    signal: AbortSignal.timeout(90_000)
  });

  if (!response.ok || !response.body) {
    throw new Error('llama-server error: ' + response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        yield { content: '', text: '', done: true, metadata: { provider: 'llama-server', model } };
        continue;
      }
      try {
        const json = JSON.parse(payload);
        const content = json.choices?.[0]?.delta?.content ?? '';
        const finished = json.choices?.[0]?.finish_reason != null;
        if (!content && !finished) continue;
        yield {
          content,
          text: content,
          done: finished,
          metadata: { provider: 'llama-server', model }
        };
      } catch {
        // skip malformed SSE line
      }
    }
  }
}

async function* streamTensorRT(request: StreamRequest): AsyncGenerator<StreamChunk> {
  const { streamLLM } = await import('$lib/server/trt-llm.js');
  const { acquireGpuLease, releaseGpuLease } = await import('$lib/server/inference/gpu-arbiter.js');

  // Acquire GPU lease (unloads Ollama models)
  const leased = await acquireGpuLease('tensorrt', 120);
  if (!leased) {
    throw new Error('GPU busy — cannot acquire TensorRT lease');
  }

  try {
    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\nUser: ${request.prompt}`
      : request.prompt;

    for await (const chunk of streamLLM({
      prompt: fullPrompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature
    })) {
      yield {
        content: chunk.content,
        text: chunk.content,
        done: chunk.done,
        metadata: { provider: 'tensorrt', model: 'trt-llm' }
      };
    }
  } finally {
    await releaseGpuLease('tensorrt');
  }
}

export const llmRouter = {
  async *generateStream(request: StreamRequest): AsyncGenerator<StreamChunk> {
    const provider = request.provider ?? 'llama-server';

    if (provider === 'tensorrt') {
      // TensorRT with auto-fallback to llama-server
      try {
        const { healthCheck } = await import('$lib/server/trt-llm.js');
        if (await healthCheck()) {
          yield* streamTensorRT(request);
          return;
        }
      } catch {
        // Fall through to llama-server
      }
      console.warn('[LLM Router] TensorRT unavailable, falling back to llama-server');
      yield* streamLlamaServer(request);
    } else {
      yield* streamLlamaServer(request);
    }
  },

  async generate(request: StreamRequest): Promise<{ content: string; metadata?: StreamChunk['metadata'] }> {
    let content = '';
    let lastMetadata: StreamChunk['metadata'] | undefined;

    for await (const chunk of this.generateStream(request)) {
      content += chunk.content;
      lastMetadata = chunk.metadata;
    }

    return { content, metadata: lastMetadata };
  }
};
