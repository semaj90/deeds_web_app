/**
 * Phase 4, Step 17: Gemma4 Invocation
 *
 * Call Gemma4 model for evidence-grounded synthesis.
 * - Input: ACEPacket with top-K candidates
 * - Output: Structured response with citations
 * - Timeout: 90 seconds
 * - Temperature: 0.3 (factual, legal domain)
 */

import fetch from 'node-fetch';

export interface GemmaRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature: number;
  max_tokens: number;
  timeout_ms?: number;
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
  private model: string = 'gemma4-legal-iq4xs-direct.gguf';
  private temperature: number = 0.3;
  private maxTokens: number = 1024;
  private timeoutMs: number = 90000; // 90 seconds

  constructor(gemmaUrl: string = 'http://127.0.0.1:8090') {
    this.gemmaUrl = gemmaUrl;
  }

  /**
   * Invoke Gemma4 with evidence context
   */
  async invoke(systemPrompt: string, userQuery: string): Promise<GemmaResponse> {
    const startTime = Date.now();

    const request: GemmaRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuery },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      timeout_ms: this.timeoutMs,
    };

    try {
      const response = await Promise.race([
        fetch(`${this.gemmaUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }),
        this.timeoutPromise(this.timeoutMs),
      ]);

      if (!response || !(response as Response).ok) {
        throw new Error(`Gemma4 returned ${(response as Response)?.status || 'timeout'}`);
      }

      const data = (await (response as Response).json()) as any;

      return {
        model: this.model,
        content: data.choices?.[0]?.message?.content || '',
        finish_reason: data.choices?.[0]?.finish_reason || 'unknown',
        usage: data.usage,
        generated_at: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[Gemma4] Invocation error:', err);

      return {
        model: this.model,
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
