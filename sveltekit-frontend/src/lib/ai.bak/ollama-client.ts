/**
 * Ollama Client for Browser
 *
 * Allows browser to call Ollama gemma3-legal:latest through API proxy
 */

export interface GenerateOptions {
 model?: string;
 temperature?: number;
 topP?: number;
 topK?: number;
 maxTokens?: number;
 stream?: boolean;
}

export interface GenerateResponse {
 response: string; model: string; duration: number;
 total_duration?: number;
 load_duration?: number;
 prompt_eval_count?: number;
 eval_count?: number;
}

export class OllamaClient {
 private baseUrl: string;
 private defaultModel: string;

 constructor(baseUrl: string = '/api/ollama', defaultModel: string = 'gemma3-legal:latest') {
 this.baseUrl = baseUrl;
 this.defaultModel = defaultModel;
 }

 /**
 * Generate text using Ollama gemma3-legal:latest
 */
 async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResponse> {
 const {
 model = this.defaultModel,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 maxTokens = 512,
 stream = false,
 } = options;

 try {
 const response = await fetch(`${this.baseUrl}/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 prompt,
 model,
 stream,
 options: { temperature, topP, topK, maxTokens },
 }),
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`Ollama API error: ${response.status} - ${error}`);
 }

 return await response.json();
 } catch (error) {
 console.error('❌ [Ollama Client] Generation failed:', error);
 throw error;
 }
 }

 /**
 * Chat with conversation history
 */
 async chat(
 messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
 options: GenerateOptions = {}
 ): Promise<string> {
 // Build prompt from messages
 let prompt = '';
 for (const msg of messages) {
 if (msg.role === 'system') {
 prompt += `System: ${msg.content}\n\n`;
 } else if (msg.role === 'user') {
 prompt += `User: ${msg.content}\n\n`;
 } else if (msg.role === 'assistant') {
 prompt += `Assistant: ${msg.content}\n\n`;
 }
 }
 prompt += 'Assistant: ';

 const result = await this.generate(prompt, options);
 return result.response;
 }

 /**
 * Check if Ollama is available
 */
 async healthCheck(): Promise<{ status: string; gemma3_legal_available: boolean; available_models: string[];
 }> {
 try {
 const response = await fetch(`${this.baseUrl}/generate`, {
 method: 'GET',
 });

 if (!response.ok) {
 return { status: 'offline', gemma3_legal_available: false, available_models: [] };
 }

 return await response.json();
 } catch {
 return { status: 'offline', gemma3_legal_available: false, available_models: [] };
 }
 }

 /**
 * Legal-specific helpers
 */
 async summarizeLegalDocument(text: string): Promise<string> {
 const result = await this.generate(
 `Summarize the following legal document concisely and accurately:\n\n${ text }`,
 { temperature: 0.3, maxTokens: 300 }
 );
 return result.response;
 }

 async answerLegalQuestion(question: string): Promise<string> {
 const result = await this.generate(
 `Context: ${ context }\n\nQuestion: ${ question }\n\nAnswer the question based only on the provided context. Be accurate and concise.`,
 { temperature: 0.5, maxTokens: 400 }
 );
 return result.response;
 }

 async extractLegalEntities(text: string): Promise<string> {
 const result = await this.generate(
 `Extract legal entities (parties, dates, locations) from this text. Return as JSON:\n\n${ text }`,
 { temperature: 0.1, maxTokens: 200 }
 );
 return result.response;
 }
}

/**
 * Singleton instance for global use
 */
export const ollamaClient = new OllamaClient();

/**
 * Get Ollama endpoint URL for gemma3-legal:latest or embeddinggemma:latest
 */
export function getOllamaEndpoint(
 model: 'gemma3-legal:latest' | 'embeddinggemma:latest' = 'gemma3-legal:latest'
): string {
 // In production, this should use environment variables
 // For now, return the local Ollama endpoint
 const baseUrl = 'http://localhost:11434';

 if (model === 'gemma3-legal:latest') {
 return `${baseUrl}/api/generate`;
 } else if (model === 'embeddinggemma:latest') {
 return `${baseUrl}/api/embeddings`;
 }

 throw new Error(`Unsupported model: ${ model }`);
}

/**
 * USAGE EXAMPLES:
 *
 * // In a Svelte component:
 * <script lang="ts">
 * import type { ollamaClient, getOllamaEndpoint } from '$lib/ai/ollama-client';
 *
 * let response = $state <string>('');
 *
 * async function ask(question: string): Promise<void> {
 * const result = await ollamaClient.generate(question, {
 * temperature: 0.7,
 * maxTokens: 300
 * });
 *
 * response = result.response;
 * console.log('Generated in:', result.duration, 'ms');
 * }
 * </script>
 *
 * <button onclick={() => ask('Explain contract law')}>
 * Ask Gemma3-Legal
 * </button>
 *
 * <p>{response}</p>
 */




