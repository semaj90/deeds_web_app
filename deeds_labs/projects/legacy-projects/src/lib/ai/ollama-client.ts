// src/lib/ai/ollama-client.ts

export interface OllamaGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface OllamaGenerateResult {
  response: string;
  model: string;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface OllamaEmbedResult {
  embedding: number[];
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async generate(prompt: string, options?: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
    console.warn('OllamaClient.generate is a placeholder and does not call a real Ollama service.');
    // In a real implementation, this would send the prompt to an Ollama service
    // and parse its response.
    return {
      response: `Placeholder response for: "${prompt.slice(0, 50)}..."`,
      model: options?.model || 'gemma3:270m',
      total_duration: 0,
      load_duration: 0,
      prompt_eval_count: 0,
      prompt_eval_duration: 0,
      eval_count: 0,
      eval_duration: 0
    };
  }

  async embed(text: string, model: string = 'embeddinggemma:latest'): Promise<number[]> {
    console.warn('OllamaClient.embed is a placeholder and does not call a real Ollama service.');
    // In a real implementation, this would send the text to an Ollama service
    // and parse its response.
    // Return a dummy embedding of 768 dimensions
    return Array(768).fill(0.123);
  }
}