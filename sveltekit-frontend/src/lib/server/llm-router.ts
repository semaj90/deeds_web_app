/**
 * LLM Router - Local-first streaming with GPU acceleration
 *
 * Providers:
 *   - tensorrt: TensorRT-LLM on GPU (primary, requires GPU arbiter lease)
 *   - ollama: Local Gemma4-legal model (fallback)
 *
 * Auto-fallback: tensorrt → ollama
 *
 * Usage:
 *   const stream = await llmRouter.generateStream({ prompt, provider, model });
 *   for await (const chunk of stream) { console.log(chunk.content); }
 */

import { isLegalTask, getOptimalModel, OLLAMA_CONFIG } from '$lib/server/ai/ollama-config.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getOllamaEndpoint } from '$lib/server/utils/ollama-endpoint.js';

const OLLAMA_URL = getOllamaEndpoint();

interface StreamRequest {
  prompt: string;
  provider?: 'ollama' | 'tensorrt';
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

async function* streamOllama(request: StreamRequest): AsyncGenerator<StreamChunk> {
  // Dynamic model selection: use ollama-config registry if no explicit model
  const model = request.model ?? (
    isLegalTask(request.prompt)
      ? getOptimalModel('legal-analysis')[0]
      : getOptimalModel('generation')[0]
  ) ?? OLLAMA_CONFIG.defaultModel;
  const response = await ollamaFetch(OLLAMA_URL + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: request.prompt,
      system: request.systemPrompt,
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 2048
      }
    })
  });

  if (!response.ok || !response.body) {
    throw new Error('Ollama error: ' + response.status);
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
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const content = json.response ?? '';
        yield {
          content,
          text: content,
          done: !!json.done,
          metadata: { provider: 'ollama', model }
        };
      } catch {
        // skip malformed JSON lines
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
    const provider = request.provider ?? 'ollama';

    if (provider === 'tensorrt') {
      // TensorRT with auto-fallback to Ollama
      try {
        const { healthCheck } = await import('$lib/server/trt-llm.js');
        if (await healthCheck()) {
          yield* streamTensorRT(request);
          return;
        }
      } catch {
        // Fall through to Ollama
      }
      console.warn('[LLM Router] TensorRT unavailable, falling back to Ollama');
      yield* streamOllama(request);
    } else {
      yield* streamOllama(request);
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
