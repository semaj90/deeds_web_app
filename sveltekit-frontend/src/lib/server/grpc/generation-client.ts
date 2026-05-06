/**
 * gRPC Generation Client (Gemma 4 VLM + Tool Calling)
 *
 * Supports:
 * - Multi-turn chat
 * - Vision (images via mmproj)
 * - Tool calling (function calling)
 * - Streaming
 * - Structured output (JSON mode)
 */

import type { Readable } from 'stream';

// ============================================================================
// TypeScript Types (Mirror Protobuf)
// ============================================================================

export interface GenerateRequest {
  messages: Message[];
  model: string;                       // "gemma4:e4b-it-q4_K_M" | "gemma3-legal:latest"
  options?: GenerateOptions;
  tools?: Tool[];                      // Tool calling
  images?: Image[];                    // Global images (or per-message)
  format?: 'json';                     // Structured output
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: Image[];                    // Per-message images (VLM)
  toolCall?: ToolCall;
}

export interface GenerateOptions {
  temperature?: number;                // 0.0-2.0 (default: 0.7)
  maxTokens?: number;                  // Max completion tokens
  topP?: number;                       // Nucleus sampling
  topK?: number;                       // Top-K sampling
  stop?: string[];                     // Stop sequences
  numCtx?: number;                     // Context window (default: 32768)
  stream?: boolean;                    // Enable streaming
  repeatPenalty?: number;              // Repetition penalty
  seed?: number;                       // Random seed
}

export interface GenerateResponse {
  id: string;
  model: string;
  createdAt: number;
  message: Message;
  done: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timing: {
    totalDurationNs: number;
    loadDurationNs: number;
    promptEvalDurationNs: number;
    evalDurationNs: number;
  };
}

export interface GenerateChunk {
  id: string;
  model: string;
  createdAt: number;
  delta: string;                       // Content delta
  done: boolean;
  toolCall?: ToolCall;
}

// ============================================================================
// Tool Calling Types
// ============================================================================

export interface Tool {
  type: 'function';
  function: FunctionTool;
}

export interface FunctionTool {
  name: string;
  description: string;
  parametersSchema: Record<string, any>;  // JSON schema
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
  result?: Record<string, any>;        // From user
}

// ============================================================================
// VLM Types
// ============================================================================

export interface Image {
  data?: Uint8Array;                   // Raw bytes
  url?: string;                        // URL
  base64?: string;                     // Base64-encoded
  format: 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif';
  metadata?: ImageMetadata;
}

export interface ImageMetadata {
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthResponse {
  healthy: boolean;
  modelsLoaded: string[];
  gpuAvailable: boolean;
  vramUsedMb: number;
  vramTotalMb: number;
  mmprojLoaded: boolean;               // VLM projector
  activeRequests: number;
}

// ============================================================================
// Client Implementation
// ============================================================================

export class GenerationClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = process.env.GENERATION_GRPC_URL ?? 'http://localhost:50052', timeout: number = 120_000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Generate completion (non-streaming)
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.serializeRequest(request)),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    return this.deserializeResponse(await response.json());
  }

  /**
   * Generate completion (streaming)
   */
  async *generateStream(request: GenerateRequest): AsyncGenerator<GenerateChunk> {
    const response = await fetch(`${this.baseUrl}/generate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.serializeRequest(request), options: { ...request.options, stream: true } }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Streaming generation failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const json = line.slice(6);
          if (json === '[DONE]') return;
          yield JSON.parse(json) as GenerateChunk;
        }
      }
    }
  }

  /**
   * Health check
   */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Batch generation (parallel on GPU)
   */
  async batchGenerate(requests: GenerateRequest[], parallel: boolean = true): Promise<GenerateResponse[]> {
    const response = await fetch(`${this.baseUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: requests.map(r => this.serializeRequest(r)),
        parallel,
      }),
      signal: AbortSignal.timeout(this.timeout * requests.length),
    });

    if (!response.ok) {
      throw new Error(`Batch generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.responses.map((r: any) => this.deserializeResponse(r));
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private serializeRequest(request: GenerateRequest): any {
    return {
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        images: m.images?.map(img => this.serializeImage(img)),
        tool_call: m.toolCall,
      })),
      model: request.model,
      options: request.options ? {
        temperature: request.options.temperature,
        max_tokens: request.options.maxTokens,
        top_p: request.options.topP,
        top_k: request.options.topK,
        stop: request.options.stop,
        num_ctx: request.options.numCtx,
        stream: request.options.stream,
        repeat_penalty: request.options.repeatPenalty,
        seed: request.options.seed,
      } : undefined,
      tools: request.tools?.map(t => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters_schema: Buffer.from(JSON.stringify(t.function.parametersSchema)),
        },
      })),
      images: request.images?.map(img => this.serializeImage(img)),
      format: request.format,
    };
  }

  private serializeImage(image: Image): any {
    return {
      data: image.data,
      url: image.url,
      base64: image.base64,
      format: image.format,
      metadata: image.metadata,
    };
  }

  private deserializeResponse(data: any): GenerateResponse {
    return {
      id: data.id,
      model: data.model,
      createdAt: data.created_at,
      message: {
        role: data.message.role,
        content: data.message.content,
        images: data.message.images,
        toolCall: data.message.tool_call,
      },
      done: data.done,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: data.prompt_eval_count + data.eval_count,
      },
      timing: {
        totalDurationNs: data.total_duration_ns,
        loadDurationNs: data.load_duration_ns,
        promptEvalDurationNs: data.prompt_eval_duration_ns,
        evalDurationNs: data.eval_duration_ns,
      },
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const generationClient = new GenerationClient(
  process.env.GENERATION_SERVICE_URL || 'http://localhost:50052'
);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Chat completion with Gemma 4
 */
export async function chat(
  messages: Message[],
  model: string = 'gemma4:e4b-it-q4_K_M',
  options?: GenerateOptions
): Promise<string> {
  const response = await generationClient.generate({ messages, model, options });
  return response.message.content;
}

/**
 * VLM chat (with images)
 */
export async function chatVLM(
  messages: Message[],
  images: Image[],
  model: string = 'gemma4:e4b-it-q4_K_M',
  options?: GenerateOptions
): Promise<string> {
  const response = await generationClient.generate({
    messages,
    model,
    images,
    options,
  });
  return response.message.content;
}

/**
 * Tool calling chat
 */
export async function chatWithTools(
  messages: Message[],
  tools: Tool[],
  model: string = 'gemma4:e4b-it-q4_K_M',
  options?: GenerateOptions
): Promise<GenerateResponse> {
  return generationClient.generate({
    messages,
    model,
    tools,
    options,
  });
}

/**
 * Structured output (JSON mode)
 */
export async function chatJSON<T = any>(
  messages: Message[],
  model: string = 'gemma4:e4b-it-q4_K_M',
  options?: GenerateOptions
): Promise<T> {
  const response = await generationClient.generate({
    messages,
    model,
    format: 'json',
    options,
  });
  return JSON.parse(response.message.content);
}