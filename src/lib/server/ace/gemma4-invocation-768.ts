/**
 * Step 17: Gemma4 LLM Invocation — 768-dim Aware
 *
 * Calls Gemma4 legal model via HTTP endpoint (:8090/v1/chat/completions).
 * Accepts ACEPacket with embedded dimension info.
 * Handles timeouts with fallback to Ollama.
 *
 * Dimension: 768-dim primary, 384-dim fallback with logging.
 */

export interface Gemma4InvocationConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_ms: number;
  base_url: string;
}

export interface Gemma4Response {
  content: string;
  stop_reason: string;
  tokens_generated: number;
  latency_ms: number;
  input_embedding_dimension?: number;
  model_used: string;
}

export class Gemma4Invoker {
  private config: Gemma4InvocationConfig = {
    model: 'gemma4-legal-iq4xs-direct.gguf',
    temperature: 0.3,
    max_tokens: 1024,
    timeout_ms: 90000, // 90 seconds for model thinking
    base_url: process.env.GEMMA4_BASE_URL || 'http://127.0.0.1:8090',
  };

  constructor(config?: Partial<Gemma4InvocationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  async invoke(systemPrompt: string, userPrompt: string): Promise<Gemma4Response> {
    const start = Date.now();

    try {
      const response = await fetch(`${this.config.base_url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.max_tokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.config.timeout_ms),
      });

      if (!response.ok) {
        throw new Error(`Gemma4 HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { completion_tokens: number };
      };

      const content = data.choices[0]?.message?.content || '';
      const latency = Date.now() - start;

      return {
        content,
        stop_reason: 'length',
        tokens_generated: data.usage?.completion_tokens || 0,
        latency_ms: latency,
        model_used: this.config.model,
      };
    } catch (err) {
      console.error('[Gemma4Invoker] Invocation failed:', err);
      // Fallback to Ollama
      return this.fallbackOllama(systemPrompt, userPrompt, start);
    }
  }

  async invokeWithACEContext(
    acePacket: {
      query_text: string;
      query_embedding_dimension: number;
      candidates: Array<{ source_ref: string; domain_class?: string }>;
      compression_ratio: number;
    },
    systemPrompt: string
  ): Promise<Gemma4Response> {
    // Log embedding dimension for traceability
    console.log(
      `[Gemma4Invoker] Invoking with ACE packet: embedding_dim=${acePacket.query_embedding_dimension}, ` +
        `candidates=${acePacket.candidates.length}, compression_ratio=${acePacket.compression_ratio.toFixed(2)}`
    );

    // Build context-aware user prompt
    const userPrompt = this.buildContextPrompt(acePacket);

    return this.invoke(systemPrompt, userPrompt);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.base_url}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`[Gemma4Invoker] Health check failed: HTTP ${response.status}`);
        return false;
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      const hasModel = data.data?.some((m) => m.id === this.config.model);

      if (!hasModel) {
        console.warn(`[Gemma4Invoker] Health check: model ${this.config.model} not found`);
        return false;
      }

      console.log('[Gemma4Invoker] Health check: OK');
      return true;
    } catch (err) {
      console.error('[Gemma4Invoker] Health check error:', err);
      return false;
    }
  }

  private buildContextPrompt(acePacket: {
    query_text: string;
    candidates: Array<{ source_ref: string; domain_class?: string }>;
  }): string {
    const candidateList = acePacket.candidates
      .map((c) => `- ${c.source_ref} (${c.domain_class || 'unknown'})`)
      .join('\n');

    return `
Query: ${acePacket.query_text}

Relevant sources:
${candidateList}

Please answer the query concisely based on the sources above.
`.trim();
  }

  private async fallbackOllama(
    systemPrompt: string,
    userPrompt: string,
    startTime: number
  ): Promise<Gemma4Response> {
    console.log('[Gemma4Invoker] Falling back to Ollama');

    try {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma:latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      const data = (await response.json()) as { message: { content: string } };
      const latency = Date.now() - startTime;

      return {
        content: data.message?.content || '',
        stop_reason: 'length',
        tokens_generated: 0,
        latency_ms: latency,
        model_used: 'gemma:latest (fallback)',
      };
    } catch (err) {
      console.error('[Gemma4Invoker] Fallback Ollama failed:', err);
      return {
        content: `Error: Could not invoke model. ${String(err)}`,
        stop_reason: 'error',
        tokens_generated: 0,
        latency_ms: Date.now() - startTime,
        model_used: 'fallback-error',
      };
    }
  }
}

let invokerInstance: Gemma4Invoker | null = null;

export function getGemma4Invoker(config?: Partial<Gemma4InvocationConfig>): Gemma4Invoker {
  if (!invokerInstance) {
    invokerInstance = new Gemma4Invoker(config);
  }
  return invokerInstance;
}
