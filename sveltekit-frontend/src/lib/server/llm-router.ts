/**
 * LLM Router - Multi-provider streaming with web search + GPU acceleration
 *
 * Providers:
 *   - tensorrt: TensorRT-LLM on GPU (primary, requires GPU arbiter lease)
 *   - ollama: Local Gemma4-legal model (fallback)
 *   - gemini: Google Gemini API with web search grounding
 *
 * Auto-fallback: tensorrt → ollama → gemini (if keys available)
 *
 * Usage:
 *   const stream = await llmRouter.generateStream({ prompt, provider, model });
 *   for await (const chunk of stream) { console.log(chunk.content); }
 */

import { ENV } from '$lib/server/env.server.js';
import { isLegalTask, getOptimalModel, OLLAMA_CONFIG } from '$lib/server/ai/ollama-config.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-exp';

interface StreamRequest {
  prompt: string;
  provider?: 'ollama' | 'gemini' | 'tensorrt';
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enableWebSearch?: boolean;
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

async function* streamGemini(request: StreamRequest): AsyncGenerator<StreamChunk> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set — cannot use Gemini provider');
  }

  const model = request.model ?? GEMINI_MODEL;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + model + ':streamGenerateContent?alt=sse&key=' + GEMINI_API_KEY;

  const tools = request.enableWebSearch !== false
    ? [{ google_search: {} }]
    : [];

  const contents = [{ role: 'user', parts: [{ text: request.prompt }] }];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 2048
    }
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  if (request.systemPrompt) {
    body.systemInstruction = { parts: [{ text: request.systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error('Gemini error ' + response.status + ': ' + errText.slice(0, 200));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const sources: Array<{ title: string; url: string }> = [];
  const searchQueries: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const candidates = json.candidates ?? [];

        for (const candidate of candidates) {
          const parts = candidate.content?.parts ?? [];

          for (const part of parts) {
            if (part.text) {
              yield {
                content: part.text,
                text: part.text,
                done: false,
                metadata: {
                  provider: 'gemini',
                  model,
                  sources,
                  searchQueries
                }
              };
            }
          }

          // Extract grounding/search metadata
          const grounding = candidate.groundingMetadata;
          if (grounding) {
            if (grounding.searchEntryPoint?.renderedContent) {
              // Search was used
            }
            if (grounding.groundingChunks) {
              for (const chunk of grounding.groundingChunks) {
                if (chunk.web) {
                  sources.push({ title: chunk.web.title ?? '', url: chunk.web.uri ?? '' });
                }
              }
            }
            if (grounding.webSearchQueries) {
              searchQueries.push(...grounding.webSearchQueries);
            }
          }
        }
      } catch {
        // skip malformed SSE data
      }
    }
  }

  // Final chunk with sources
  yield {
    content: '',
    text: '',
    done: true,
    metadata: {
      provider: 'gemini',
      model,
      sources,
      searchQueries
    }
  };
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
    } else if (provider === 'gemini') {
      yield* streamGemini(request);
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
