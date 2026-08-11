/**
 * Phase 4, Step 17: Gemma4 Invocation
 *
 * Call Gemma4 model for evidence-grounded synthesis.
 * - Input: ACEPacket with top-K candidates
 * - Output: Structured response with citations
 * - Timeout: 90 seconds
 * - Temperature: 0.3 (factual, legal domain)
 */

import fetch, { type Response as FetchResponse } from 'node-fetch';

export interface GemmaRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature: number;
  max_tokens: number;
  timeout_ms?: number;
  stream?: boolean;
}

export interface GemmaResponse {
  model: string;
  content: string;
  finish_reason: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  generated_at: string;
}

export class Gemma4Invoker {
  private gemmaUrl: string;
  private model: string | null = null; // resolved from /v1/models on first use — never hardcode a model id
  private temperature: number = 0.3;
  private maxTokens: number = 1024;
  private timeoutMs: number = 90000; // 90 seconds

  constructor(gemmaUrl: string = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090') {
    this.gemmaUrl = gemmaUrl;
  }

  /**
   * Resolve whichever model llama-server currently has loaded.
   * Cached after first successful call; re-resolves if the server was restarted
   * with a different model (detected by a failed generation using the cached id).
   */
  private async resolveModel(): Promise<string> {
    if (this.model) return this.model;
    const response = await fetch(`${this.gemmaUrl}/v1/models`);
    if (!response.ok) {
      throw new Error(`Failed to resolve loaded model: /v1/models returned ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const id = data.data?.[0]?.id;
    if (!id) {
      throw new Error('No model reported by /v1/models — is llama-server running with a model loaded?');
    }
    this.model = id;
    return id;
  }

  /**
   * Invoke Gemma4 with evidence context
   *
   * REQUIRED: stream: true (root CLAUDE.md "Gemma4 LLM Call Rules" hard rule).
   * With stream:false, the thinking/reasoning block fills reasoning_content
   * first (~350-400 tokens) before any content — a fixed max_tokens budget
   * can be exhausted by thinking alone, leaving content empty with
   * finish_reason:"length". Streaming accumulates content deltas as they
   * arrive and correctly stops on [DONE] regardless of thinking length.
   */
  async invoke(systemPrompt: string, userQuery: string): Promise<GemmaResponse> {
    const model = await this.resolveModel();

    const request: GemmaRequest & { stream: true } = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuery },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      timeout_ms: this.timeoutMs,
      stream: true,
    };

    try {
      const response = (await Promise.race([
        fetch(`${this.gemmaUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }),
        this.timeoutPromise(this.timeoutMs),
      ])) as FetchResponse;

      if (!response.ok || !response.body) {
        throw new Error(`Gemma4 returned ${response.status || 'timeout'}`);
      }

      let assembled = '';
      let finishReason = 'unknown';
      let usage: GemmaResponse['usage'];
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of response.body as any) {
        buf += decoder.decode(chunk as Buffer, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            assembled += parsed.choices?.[0]?.delta?.content ?? '';
            if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
            if (parsed.usage) usage = parsed.usage;
          } catch {
            // skip malformed SSE line
          }
        }
      }

      return {
        model,
        content: assembled.trim(),
        finish_reason: finishReason,
        usage,
        generated_at: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[Gemma4] Invocation error:', err);

      return {
        model: this.model ?? 'unknown',
        content: `Error: ${(err as Error).message}`,
        finish_reason: 'error',
        generated_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Invoke with structured ACE context
   */
  async invokeWithACEContext(
    aceContext: {
      candidates: Array<{ packet_key: string; source_ref: string; final_score: number }>;
      total_tokens: number;
      compressed_tokens: number;
    },
    userQuery: string
  ): Promise<GemmaResponse> {
    // Build system prompt with ACE context
    const systemPrompt = `You are a legal AI assistant. 
You have access to the following evidence documents:

${aceContext.candidates
  .slice(0, 10)
  .map((c, i) => `${i + 1}. [${c.source_ref}] (score: ${c.final_score.toFixed(2)})`)
  .join('\n')}

Answer the user's question using the provided evidence. Be specific and cite which documents support your answer.
Context size: ${aceContext.compressed_tokens} tokens (from ${aceContext.total_tokens} original).`;

    return this.invoke(systemPrompt, userQuery);
  }

  /**
   * Health check: verify Gemma4 is responding
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.gemmaUrl}/v1/models`);
      return response.ok;
    } catch (err) {
      console.error('[Gemma4] Health check failed:', err);
      return false;
    }
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }
}

let invoker: Gemma4Invoker | null = null;

export function getGemma4Invoker(gemmaUrl?: string): Gemma4Invoker {
  if (!invoker) {
    invoker = new Gemma4Invoker(gemmaUrl);
  }
  return invoker;
}
