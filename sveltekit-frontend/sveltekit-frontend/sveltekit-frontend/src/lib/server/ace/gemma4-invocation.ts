/**
 * Step 17: Gemma4 Invocation for Evidence-Grounded Synthesis
 */

export interface GemmaRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  max_tokens: number;
}

export interface GemmaResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export class Gemma4Invoker {
  private baseUrl: string;
  private temperature: number = 0.3;
  private maxTokens: number = 1024;
  private timeout: number = 90000;

  constructor(baseUrl: string = 'http://127.0.0.1:8090', temperature: number = 0.3) {
    this.baseUrl = baseUrl;
    this.temperature = temperature;
  }

  async invoke(prompt: string): Promise<string> {
    try {
      const request: GemmaRequest = {
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [{ role: 'user', content: prompt }],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Gemma4 error: ${response.status}`);
      }

      const data = (await response.json()) as GemmaResponse;
      return data.choices[0].message.content;
    } catch (err) {
      console.error('[Gemma4Invoker] Error:', err);
      return '';
    }
  }

  async invokeWithACEContext(acePacket: any): Promise<string> {
    const prompt = `Analyze: ${acePacket.summary}`;
    return this.invoke(prompt);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (err) {
      return false;
    }
  }
}

let invoker: Gemma4Invoker | null = null;

export function getGemma4Invoker(): Gemma4Invoker {
  if (!invoker) {
    invoker = new Gemma4Invoker();
  }
  return invoker;
}
