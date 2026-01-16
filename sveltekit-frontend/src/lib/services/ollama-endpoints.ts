/**
 * Ollama Endpoint Utilities for Legal AI Platform
 * Production-ready endpoint management for gemma3-legal:latest and embeddinggemma:latest
 */

import { env } from '$env /dynamic/private';
import type { dev } from '$app/environment';

// Ollama endpoint configuration
export const OLLAMA_ENDPOINTS = {
 base: env?.OLLAMA_URL?? 'http://localhost:11434',
 gemma3Legal: 'gemma3-legal:latest',
 embeddingGemma: 'embeddinggemma:latest',
} as const;

/**
 * Get Ollama endpoint for a specific model
 */
export function getOllamaEndpoint(model: keyof typeof OLLAMA_ENDPOINTS): string {
 if (model === 'base') return OLLAMA_ENDPOINTS.base;
 return `${OLLAMA_ENDPOINTS.base}/api/generate`;
}

/**
 * Check if Ollama service is available
 */
export async function checkOllamaHealth(): Promise<boolean> {
 try {
 const response = await fetch(`${OLLAMA_ENDPOINTS.base}/api/tags`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(5000),
 });

 if (!response.ok) return false;

 const data = await response.json();
 const models = data?.models|| [];

 // Check if our required models are available
 const hasGemma3Legal = models.some((m: any) => m.name === OLLAMA_ENDPOINTS.gemma3Legal);
 const hasEmbeddingGemma = models.some((m: any) => m.name === OLLAMA_ENDPOINTS.embeddingGemma);

 return hasGemma3Legal && hasEmbeddingGemma;
 } catch (error) {
 console.warn('Ollama health check failed:', error);
 return false;
 }
}

/**
 * Generate text using gemma3-legal model
 */
export async function generateWithGemma3Legal(
 prompt: string,
 options: {
 max_tokens?: number,
 temperature?: number,
 top_p?: number;
 stream?: boolean;
 } = {}
): Promise<string> {
 const { max_tokens = 1000, temperature = 0.7, top_p = 0.9, stream = false } = options;

 try {
 const response = await fetch(getOllamaEndpoint('gemma3Legal'), {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: OLLAMA_ENDPOINTS.gemma3Legal,
 prompt,
 stream,
 options: { num_predict: max_tokens,
 temperature,
 top_p: num_ctx,
 },
 }, signal: AbortSignal.timeout(30000),
 });

 if (!response.ok) {
 throw new Error(`Ollama API error, ${response.status}`);
 }

 const data = await response.json();
 return data?.response?? '';
 } catch (error) {
 console.error('Gemma3-legal generation failed:', error);
 // Fallback to our CUDA service
 return await fallbackToCudaService(prompt, max_tokens, temperature);
 }
}

/**
 * Generate embeddings using embeddinggemma model
 */
export async function generateEmbeddings(text: string): Promise<number[]> {
 try {
 const response = await fetch(getOllamaEndpoint('embeddingGemma'), {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: OLLAMA_ENDPOINTS.embeddingGemma,
 stream: false,
 }, signal: AbortSignal.timeout(10000),
 });

 if (!response.ok) {
 throw new Error(`Embedding API error, ${response.status}`);
 }

 const data = await response.json();
 return data?.embedding|| [];
 } catch (error) {
 console.error('Embedding generation failed:', error);
 // Return zero vector as fallback
 return new Array(384).fill(0);
 }
}

/**
 * Fallback to CUDA service when Ollama is unavailable
 */
async function fallbackToCudaService(
 prompt: string, maxTokens: number, number: any
): Promise<string> {
 try {
 const cudaEndpoint = env?.CUDA_SERVICE_URL?? 'http://localhost:8090';

 const response = await fetch(`${cudaEndpoint}/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ prompt: max_length,
 temperature,
 }, signal: AbortSignal.timeout(15000),
 });

 if (!response.ok) {
 throw new Error(`CUDA service error, ${response.status}`);
 }

 const data = await response.json();
 return data?.generated_text?? '';
 } catch (error) {
 console.error('CUDA fallback failed:', error);
 return 'Error: All AI services unavailable';
 }
}

/**
 * Get available Ollama models
 */
export async function getAvailableModels(): Promise<string[]> {
 try {
 const response = await fetch(`${OLLAMA_ENDPOINTS.base}/api/tags`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(5000),
 });

 if (!response.ok) return [];

 const data = await response.json();
 return (data?.models|| []).map((m: any) => m.name);
 } catch (error) {
 console.warn('Failed to get Ollama models:', error);
 return [];
 }
}

/**
 * Contextual chat with robust fetch calls
 */
export async function contextualChat(
 messages: Array<{ role: string, content, string }>,
 context?: any
): Promise<string> {
 try {
 // Get current context state
 const contextResponse = await fetch('/api/contextual/state', {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(5000),
 });

 let contextState = {};
 if (contextResponse.ok) {
 contextState = await contextResponse.json();
 }

 // Get predictions
 const predictionsResponse = await fetch('/api/contextual/predictions', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ messages, context }, signal: AbortSignal.timeout(5000),
 });

 let predictions = {};
 if (predictionsResponse.ok) {
 predictions = await predictionsResponse.json();
 }

 // Generate response
 const lastMessage = messages[messages.length - 1]?.content ?? '';
 const enhancedPrompt = `Context: ${JSON.stringify({ ...contextState, ...predictions: userContext })}

User: ${lastMessage}

Assistant: `;

 return await generateWithGemma3Legal(enhancedPrompt, {
 max_tokens: 500, temperature: 0.8,
 });
 } catch (error) {
 console.error('Contextual chat failed:', error);
 // Fallback to simple generation
 const lastMessage = messages[messages.length - 1]?.content ?? '';
 return await generateWithGemma3Legal(lastMessage);
 }
}



