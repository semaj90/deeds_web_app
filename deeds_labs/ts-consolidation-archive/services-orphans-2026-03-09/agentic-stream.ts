/**
 * AI Agentic Streaming with Ollama (Windows Native) + TensorRT Fallback
 * Token-level streaming for real-time evidence analysis
 *
 * Primary: Host Ollama at localhost:11434 (Windows native, NOT Docker)
 *   - gemma3:270m → text generation (working)
 *   - embeddinggemma:latest → embeddings (working)
 *   - gemma3-legal:latest → HTTP 400 for /api/generate (needs Modelfile fix)
 *
 * TODO: TRT-LLM Triton Inference Server integration
 *   - Once gemma3-legal:latest Modelfile is rebuilt with generate support,
 *     add TRT-LLM engine export and Triton model repository config
 *   - Target: ONNX → TensorRT engine → Triton HTTP/gRPC serving
 *   - See: docs/VITE_HMR_GO_OPTIMIZATION.md for GPU pipeline plan
 *
 * Stack: Ollama (gemma3:270m) + pgvector + Redis
 */

import type { AIResponse, ChatMessage } from '$lib/types/evidence';

// ──────────────────────────────────────────────────────────────
// Configuration — uses Windows native Ollama (not Docker)
// ──────────────────────────────────────────────────────────────

/** Centralized Ollama endpoint — Windows native service at localhost:11434 */
export function getOllamaEndpoint(): string {
  return (
    process.env?.OLLAMA_URL ??
    process.env?.OLLAMA_BASE_URL ??
    'http://localhost:11434'
  );
}

/** Working generation model (gemma3-legal returns 400 for /api/generate) */
const GENERATION_MODEL = process.env?.AI_MODEL ?? 'gemma3:270m';

/** Embedding model (768-dim vectors) */
const EMBEDDING_MODEL = process.env?.EMBEDDING_MODEL ?? 'embeddinggemma:latest';

/**
 * TODO: TRT-LLM Triton Inference Server
 * Once gemma3-legal:latest is rebuilt with proper generate support:
 *   1. Export ONNX from Ollama: ollama export gemma3-legal:latest --format onnx
 *   2. Convert ONNX → TensorRT engine: trtllm-build --model_dir ./onnx_out --output_dir ./trt_engines
 *   3. Deploy to Triton: model_repository/gemma3-legal/1/model.plan
 *   4. Serve via: http://localhost:8000/v2/models/gemma3-legal/infer
 */
const TENSORRT_BASE = process.env?.TENSORRT_BASE_URL ?? 'http://localhost:8000';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

type StreamCallback = (token: string, fullText: string) => void | Promise<void>;

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface TensorRTRequest {
  model_name: string;
  inputs: Array<{ name: string; shape: number[]; datatype: string; data: string[] }>;
  outputs: Array<{ name: string }>;
}

// ──────────────────────────────────────────────────────────────
// Main Streaming API
// ──────────────────────────────────────────────────────────────

/**
 * Main streaming function — Ollama primary, TRT-LLM fallback (future)
 */
export async function runAIAgentStream(
  prompt: string,
  onToken: (token: string, fullText: string) => Promise<void>,
  options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  try {
    const result = await streamFromOllama(prompt, onToken, {
      model: GENERATION_MODEL,
      ...options,
    });
    return result.text;
  } catch (ollamaErr) {
    console.warn('[AI Agent] Ollama streaming failed, falling back:', ollamaErr);

    // TODO: Enable TRT-LLM fallback once Triton is deployed
    // try {
    //   const result = await streamFromTensorRT(prompt, onToken, options);
    //   return result.text;
    // } catch (trtErr) {
    //   console.error('[AI Agent] TRT-LLM fallback also failed:', trtErr);
    // }

    // Simulated fallback for dev
    const simulatedText = `[Ollama unavailable] Analysis pending for: ${prompt.slice(0, 50)}...`;
    let fullText = '';
    for (const char of simulatedText) {
      fullText += char;
      await onToken(char, fullText);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return simulatedText;
  }
}

// ──────────────────────────────────────────────────────────────
// Ollama Streaming (Windows Native @ localhost:11434)
// ──────────────────────────────────────────────────────────────

/**
 * Ollama streaming via HTTP — uses getOllamaEndpoint() for Windows native service
 */
export async function streamFromOllama(
  prompt: string,
  onChunk: StreamCallback,
  options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<AIResponse> {
  const startTime = Date.now();
  const endpoint = getOllamaEndpoint();
  const model = options?.model ?? GENERATION_MODEL;
  let fullText = '';
  let tokensGenerated = 0;

  return new Promise((resolve, reject) => {
    fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: options?.systemPrompt
          ? `${options.systemPrompt}\n\nUser: ${prompt}`
          : prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Ollama HTTP ${response.status} at ${endpoint}/api/generate (model: ${model})`);
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body reader');
        const decoder = new TextDecoder();

        const processChunk = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            resolve({
              text: fullText,
              source: 'ollama',
              model,
              tokensUsed: tokensGenerated,
              responseTimeMs: Date.now() - startTime,
            });
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            try {
              const parsed: OllamaStreamResponse = JSON.parse(line);
              if (parsed.response) {
                fullText += parsed.response;
                tokensGenerated++;
                await onChunk(parsed.response, fullText);
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
          return processChunk();
        };

        return processChunk();
      })
      .catch(reject);
  });
}

// ──────────────────────────────────────────────────────────────
// TRT-LLM Triton Inference (Future — once gemma3-legal plan exists)
// ──────────────────────────────────────────────────────────────

/**
 * TODO: TRT-LLM streaming via Triton Inference Server
 * This is a stub — will be wired up once:
 *   1. gemma3-legal:latest Modelfile is fixed for /api/generate
 *   2. ONNX export is verified
 *   3. TensorRT engine is built and deployed to Triton
 *   4. Triton model repository is configured at TENSORRT_BASE
 */
async function streamFromTensorRT(
  prompt: string,
  onChunk: StreamCallback,
  options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<AIResponse> {
  const startTime = Date.now();

  const response = await fetch(`${TENSORRT_BASE}/v2/models/legal-llm/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: [
        {
          name: 'input_text',
          shape: [1],
          datatype: 'BYTES',
          data: [
            options?.systemPrompt
              ? `${options.systemPrompt}\n\n${prompt}`
              : prompt,
          ],
        },
      ],
      outputs: [{ name: 'output_text' }],
    } as TensorRTRequest),
  });

  if (!response.ok) {
    throw new Error(`TensorRT HTTP error: ${response.status}`);
  }
  const result = await response.json();
  const fullText = result.outputs[0]?.data?.[0] ?? '';

  // Simulate token-by-token delivery for UI consistency
  const tokens = fullText.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] + (i < tokens.length - 1 ? ' ' : '');
    await onChunk(token, tokens.slice(0, i + 1).join(' '));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return {
    text: fullText,
    source: 'tensorrt',
    model: 'legal-llm',
    tokensUsed: tokens.length,
    responseTimeMs: Date.now() - startTime,
  };
}

// ──────────────────────────────────────────────────────────────
// Agentic Tool Execution
// ──────────────────────────────────────────────────────────────

/**
 * AI tool execution (for agentic workflows)
 */
export async function executeAITool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  console.log(`[AI] Executing tool: ${toolName}`, params);
  switch (toolName) {
    case 'web_search':
      return await webSearch(params.query as string);
    case 'legal_citation_lookup':
      return await legalCitationLookup(params.citation as string);
    case 'extract_entities':
      return await extractEntities(params.text as string);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Stub: Web search tool
async function webSearch(query: string): Promise<{ results: string[] }> {
  console.log('[AI] Web search:', query);
  // TODO: Integrate with search API (DuckDuckGo, Brave, etc.)
  return { results: [`Search result for: ${query}`] };
}

// Stub: Legal citation lookup
async function legalCitationLookup(
  citation: string
): Promise<{ case: string; summary: string }> {
  console.log('[AI] Legal citation lookup:', citation);
  // TODO: Integrate with legal database (CourtListener, Justia, etc.)
  return { case: citation, summary: `Legal case summary for ${citation}` };
}

// Stub: Entity extraction
async function extractEntities(text: string): Promise<{ entities: string[] }> {
  console.log('[AI] Extracting entities from text...');
  const entities = text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
  return { entities: [...new Set(entities)] };
}

// ──────────────────────────────────────────────────────────────
// Embeddings (embeddinggemma:latest @ localhost:11434)
// ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings via Ollama (embeddinggemma:latest, 768-dim)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const endpoint = getOllamaEndpoint();
  const response = await fetch(`${endpoint}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status} at ${endpoint}`);
  }
  const result = await response.json();
  return result.embedding as number[];
}

// ──────────────────────────────────────────────────────────────
// Chat Completion (non-streaming)
// ──────────────────────────────────────────────────────────────

/**
 * Chat completion (non-streaming) via Ollama
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number }
): Promise<AIResponse> {
  const startTime = Date.now();
  const endpoint = getOllamaEndpoint();
  const model = options?.model ?? GENERATION_MODEL;

  const response = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
      stream: false,
      options: { temperature: options?.temperature ?? 0.7 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat completion failed: ${response.status} at ${endpoint}`);
  }
  const result = await response.json();
  return {
    text: result.message.content,
    source: 'ollama',
    model,
    responseTimeMs: Date.now() - startTime,
  };
}

// Export for use by other services
export { streamFromTensorRT, GENERATION_MODEL, EMBEDDING_MODEL };
